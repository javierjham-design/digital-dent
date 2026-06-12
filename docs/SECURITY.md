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

## Pendientes recomendados (no bloqueantes para lanzar)

1. **2FA para super-admin** (TOTP). El super-admin puede ver todas las clínicas: es la cuenta más valiosa.
2. **Monitoreo de errores** (Sentry o similar) + alertas de caída (UptimeRobot apuntando a `app.clariva.cl`).
3. **Verificar backups de Postgres en Railway** (los gestiona Railway; confirmar retención y hacer una prueba de restore).
4. **Rate limit distribuido** (Redis) si algún día se escala a varias réplicas.
5. **Rotación de NEXTAUTH_SECRET / ENCRYPTION_KEY** documentada (rotar invalida sesiones y tokens Google: planificar ventana).
6. **Revisión periódica de dependencias**: `npm audit` en cada sprint.

## Qué hacer ante un incidente

1. **Sospecha de cuenta comprometida**: resetear contraseña del usuario desde super-admin → la sesión vieja muere en máximo 12 h. Para corte inmediato, rotar `NEXTAUTH_SECRET` en Railway (invalida TODAS las sesiones).
2. **Abuso de API**: el rate limit responde 429 automáticamente. Para bloquear una IP específica de forma permanente, agregarla a nivel de Railway/Cloudflare.
3. **Fuga de credenciales Google**: desconectar la clínica desde Configuración → Google (revoca y borra tokens) y revocar acceso en myaccount.google.com.
