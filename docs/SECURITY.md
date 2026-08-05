# Seguridad de Cláriva

> Postura de seguridad de la plataforma. Actualizado: 2026-06-11.

## Capas implementadas

### 1. Headers HTTP (next.config.ts)
Aplicados a todas las respuestas:

| Header | Valor | Protege contra |
|---|---|---|
| `Strict-Transport-Security` | 2 años, incluye subdominios, preload | Downgrade a HTTP / MITM |
| `X-Frame-Options` + CSP `frame-ancestors 'none'` | DENY | Clickjacking |
| `X-Content-Type-Options` | nosniff | MIME sniffing |
| `Referrer-Policy` | strict-origin-when-cross-origin | Fuga de URLs internas (ids de pacientes) |
| `Permissions-Policy` | cámara/mic/geo/payment bloqueados | Abuso de APIs del navegador |
| CSP `object-src 'none'; base-uri 'self'` | — | Inyección de plugins / base hijacking |
| `poweredByHeader: false` | — | Fingerprinting del framework |

### 2. Anti fuerza bruta (lib/rate-limit.ts)
Rate limiting en memoria, ventana deslizante, solo los **fallos** consumen cupo:

| Recurso | Límite | Clave |
|---|---|---|
| Login | 5 fallos / 15 min | por usuario (slug+username o email) |
| Login | 30 fallos / 15 min | por IP (cubre enumeración de usuarios) |
| Cambio de contraseña | 5 intentos / 15 min | por usuario |
| API global | 300 req / min | por IP (middleware, capa gruesa) |

El usuario bloqueado ve cuántos minutos esperar. Un login correcto resetea su contador.

**Limitación conocida:** el estado vive en memoria del proceso. Con 1 instancia en Railway (configuración actual) es efectivo. Si se escala a N réplicas, migrar a Redis/Upstash.

### 3. Sesiones
- JWT con expiración de **12 horas** (cubre la jornada; evita sesiones eternas en computadores compartidos de recepción).
- Cookies `secure` + `httpOnly` (NextAuth automático bajo HTTPS).
- Redirect post-login validado contra `PLATFORM_DOMAIN` (no open redirect).

### 4. Contraseñas
- Mínimo **8 caracteres con letra y número** (antes 6 sin requisitos). Aplica a contraseñas nuevas; las existentes no se invalidan.
- Hash bcrypt (cost 12 en cambios nuevos; 10 en legacy — se migra al cambiar).
- Primer login fuerza cambio de contraseña (`passwordChangedAt = null`).
- Las contraseñas generadas por la plataforma son aleatorias de 12 caracteres.

### 5. Multi-tenancy (preexistente, verificado)
- Todo query filtra por `clinicaId` del JWT.
- `updateMany/deleteMany` incluyen `clinicaId` en el WHERE (defensa en profundidad).
- Middleware inyecta `x-clinica-slug` y aísla subdominios; subdominios reservados no resuelven como clínicas.

### 6. Secretos y datos sensibles
- Refresh tokens de Google cifrados AES-256-GCM (`ENCRYPTION_KEY` en env).
- OAuth state firmado HMAC-SHA256 con expiración de 10 min (anti-CSRF).
- Cron protegido por `CRON_SECRET`.
- Auditoría de acciones de super-admin en `AuditLogAdmin` (con IP y user-agent).

### 7. 2FA obligatorio para super-admin (TOTP)
- **Solo super-admin** (cuentas del schema de CONTROL). El login de las clínicas (slug+usuario) **no** tiene 2FA y no se toca.
- Login en dos pasos: la contraseña correcta **no** emite sesión; devuelve un **desafío** firmado (JWT `stage:'2fa'`, TTL 10 min) que no sirve como Bearer. La sesión sale del segundo paso (`/auth/2fa/verify`).
- **Alta** (primer login): `/auth/2fa/setup` muestra el **QR una sola vez** + el secreto + **10 códigos de respaldo de un solo uso**. Los códigos se guardan **hasheados con bcrypt** (nunca en claro); el QR/secreto no se vuelven a mostrar.
- El **secreto TOTP va cifrado** con la misma AES-256-GCM de `lib/crypto.ts` (`ENCRYPTION_KEY`), igual que los refresh tokens de Google.
- **Rate limit propio** (`lib/rate-limit.ts`, 5 intentos / 15 min por `sub` y por IP): solo los **fallos** consumen cupo; un código correcto no gasta intentos.
- **Recuperación normal**: si se pierde el teléfono, se entra con un **código de respaldo** (cada uno sirve una sola vez y queda consumido).
- Campos aditivos en `prisma/control/schema.prisma` (`PlatformAdmin`): `totpSecret`, `totpEnabled`, `totpBackupCodes`, `totpEnrolledAt`. Se aplican en deploy vía `control:push` (prestart).

## Pendientes recomendados (no bloqueantes para lanzar)

1. ~~**2FA para super-admin** (TOTP)~~ → **RESUELTO (2026-08-05)**: TOTP obligatorio en el login del super-admin (ver §7). El super-admin puede ver todas las clínicas: es la cuenta más valiosa.
2. ~~Monitoreo de errores + alertas de caída~~ → **RESUELTO (2026-08-03)**: Sentry (backend + frontend/web, sin datos de pacientes), `/health` con readiness real y logging con request-id. Ver `docs/OBSERVABILIDAD.md`. Falta cargar los DSN y configurar UptimeRobot (operativo).
3. ~~Verificar backups de Postgres en Railway~~ → **RESUELTO (2026-08-03)**: sistema de backups de 3 capas con **dump lógico por clínica cifrado y fuera de Railway** + **restauración quirúrgica por clínica** (sin tocar a las demás) + ensayo de restauración semanal. Ver `docs/BACKUPS.md`. Los snapshots de volumen de Railway (capa 1) solos no alcanzaban: restaurar una clínica hacía retroceder a todas.
4. **Rate limit distribuido** (Redis) si algún día se escala a varias réplicas.
5. **Rotación de NEXTAUTH_SECRET / ENCRYPTION_KEY** documentada (rotar invalida sesiones y tokens Google: planificar ventana).
6. **Revisión periódica de dependencias**: `npm audit` en cada sprint.

## Qué hacer ante un incidente

1. **Sospecha de cuenta comprometida**: resetear contraseña del usuario desde super-admin → la sesión vieja muere en máximo 12 h. Para corte inmediato, rotar `NEXTAUTH_SECRET` en Railway (invalida TODAS las sesiones).
2. **Abuso de API**: el rate limit responde 429 automáticamente. Para bloquear una IP específica de forma permanente, agregarla a nivel de Railway/Cloudflare.
3. **Fuga de credenciales Google**: desconectar la clínica desde Configuración → Google (revoca y borra tokens) y revocar acceso en myaccount.google.com.
4. **Super-admin sin 2FA (perdió el teléfono Y todos los códigos de respaldo)**: no hay "olvidé mi 2FA" por diseño — el authenticator y los códigos son los únicos factores. La única salida es **acceso directo a la base de control** (`clariva_control`, DATABASE_PUBLIC_URL de Railway, nunca el host `.internal`). En la fila del admin afectado (tabla `PlatformAdmin`, buscar por `email`), **poner `totpEnabled = false` y `totpSecret = NULL` y `totpBackupCodes = NULL`**. Con eso el próximo login del admin vuelve a caer en el flujo de **alta** (modo `alta`): la contraseña sigue siendo obligatoria, y tras validarla el sistema le muestra un QR nuevo y códigos nuevos. No se puede saltar la contraseña; esto solo **resetea el segundo factor**. Registrar el hecho (quién, cuándo, por qué) porque es una intervención manual sobre la cuenta más sensible.
   ```sql
   -- Reset del 2FA de un super-admin (solo si perdió authenticator + todos los backup codes)
   UPDATE "PlatformAdmin"
      SET "totpEnabled" = false, "totpSecret" = NULL, "totpBackupCodes" = NULL, "totpEnrolledAt" = NULL
    WHERE email = 'super@clariva.cl';
   ```
   Si además hay **un solo** super-admin y también se perdió la contraseña, se resetea la contraseña por el mismo camino (columna `password` con un bcrypt generado aparte, o `passwordChangedAt = NULL` para forzar cambio en el primer login).
