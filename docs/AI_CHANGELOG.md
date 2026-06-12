# AI Changelog

> Historial cronológico de cambios realizados con asistencia de Claude.
> **Las entradas más recientes van arriba.** Añade entradas nuevas insertándolas debajo del encabezado.

---

## 2026-06-12 — Confirmaciones WhatsApp (Twilio) + extras facturables por clínica

**Solicitud:** Automatizar envío/recepción de confirmaciones por WhatsApp vía Twilio (oficial). Como tiene costo por volumen, debe cobrarse como "extra" por clínica en el Super Admin e incluirse en la facturación mensual.

**Archivos modificados:**
- `prisma/schema.prisma` — NUEVO modelo `ExtraSuscripcion` (cargo recurrente por clínica: nombre, montoMensual, activo). `Clinica`: + `waEnabled`, `waTwilioSid`, `waTwilioToken` (cifrado AES-256-GCM), `waNumero`, `waTemplateSid`, `waHorasAntes`, relación `extras`. `Cita`: + `waMessageSid` (indexado, evita doble envío y correlaciona respuestas). **Todo aditivo, sin riesgo de datos.**
- `lib/whatsapp.ts` (NUEVO) — Envío de plantilla Twilio Content API vía fetch (sin SDK): `enviarRecordatorioCita`, `enviarRecordatoriosPendientes` (cron), `procesarRespuestaEntrante` (confirma/cancela/reagenda + CitaLog), `validarFirmaTwilio` (HMAC-SHA1 de X-Twilio-Signature), `interpretarRespuesta`, `fonoAE164`.
- `app/api/whatsapp/webhook/route.ts` (NUEVO) — Webhook de respuestas: resuelve clínica por número receptor, valida firma Twilio con el token de esa clínica, actualiza la cita y responde TwiML al paciente.
- `app/api/whatsapp/recordatorios/route.ts` (NUEVO) — Disparo de envíos: header `x-cron-secret` (cron) o sesión admin (botón manual).
- `app/api/admin/clinicas/[id]/extras/` + `[extraId]/` (NUEVOS) — CRUD de extras con auditoría.
- `app/api/admin/clinicas/[id]/whatsapp/route.ts` (NUEVO) — GET/PUT config Twilio (token nunca se devuelve; solo se pisa si viene uno nuevo).
- `lib/billing.ts` — `montoExtrasMensual()`, `precioMensualTotal()`.
- Super Admin: dashboard y `suscripciones/resumen` suman extras activos al MRR/ARR; `suscripcion-panel` muestra "plan + extras" y sugiere el pago con extras; `extras-whatsapp-panels.tsx` (NUEVO) con los dos paneles en el detalle de clínica.
- `proxy.ts` — `/api/whatsapp` en PUBLIC_API (firma Twilio + CRON_SECRET protegen).
- `lib/audit-admin.ts` — acciones CREAR/EDITAR/ELIMINAR_EXTRA y CONFIGURAR_WHATSAPP.

**Convención de plantilla Twilio:** variables {{1}} paciente, {{2}} clínica, {{3}} fecha, {{4}} hora; botones quick-reply Confirmar / Reagendar / Cancelar. Webhook entrante: `https://app.clariva.cl/api/whatsapp/webhook`.

**Pendientes derivados:**
- Configurar cron de Railway (cada hora) → POST `/api/whatsapp/recordatorios` con header `x-cron-secret`.
- Piloto Digital Dent: agregar 2º número a su WABA, conectarlo a Twilio, crear la plantilla, cargar credenciales en el panel.

---

## 2026-06-12 — Agenda semanal por profesional + vista diaria estilo planilla clínica

**Solicitud:** (con capturas de Dentalink como referencia) La semanal con todos los doctores superpuestos era ilegible → dejar un solo profesional. La diaria → lista de trabajo con datos del paciente y cambio de estado inline.

**Archivos modificados:**
- `app/(dashboard)/agenda/agenda-client.tsx`:
  - Semanal SIEMPRE de un profesional: selector en el header, sin opción "Todos" (que sigue en Diaria/Global). Default = el propio usuario si es doctor.
  - ListaDiaria rediseñada: hora en bloque coloreado por estado (inicio→fin), RUT formateado + teléfono + motivo, dropdown de estado inline por fila, buscador del día (nombre/RUT/teléfono, ignora tildes), bloqueos ocultos durante búsqueda.
  - Panel lateral: "Marcar todos" para los filtros de estado.

**Riesgos / consideraciones:**
- `doctorFilter` ahora inicia en un doctor concreto (la vista inicial es semanal). Al cambiar a Diaria/Global se puede elegir "Todos" manualmente.

---

## 2026-06-12 — Drag & drop en agenda, toasts globales y hardening de seguridad

**Solicitud:** Drag & drop para reagendar, toasts en el resto de módulos, y "seguridad cibernética robusta" pre-comercialización.

**Archivos modificados:**
- `app/(dashboard)/agenda/agenda-client.tsx` — FullCalendar con `editable`: arrastrar cita = reagendar, estirar borde = cambiar duración. El backend valida solapes/bloqueos; si rechaza, el evento vuelve a su lugar con toast de error. Bloqueos no arrastrables.
- `components/Evoluciones.tsx`, `components/PlanesTratamiento.tsx`, `pacientes-client.tsx`, `ficha-client.tsx`, super-admin (`planes-client`, `suscripcion-panel`, `clinica-detail-client`) — 15 `alert()` convertidos a `toast.error`.
- `next.config.ts` — Security headers globales: HSTS (2 años, subdominios, preload), X-Frame-Options DENY + CSP frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy, sin X-Powered-By.
- `lib/rate-limit.ts` (NUEVO) — Limitador en memoria con ventana deslizante (`rateLimit`, `peekLimit`, `registerFailure`, `resetLimit`). Edge-safe.
- `lib/auth.ts` — Login con anti fuerza bruta: 5 fallos/15min por usuario + 30/15min por IP (solo fallos consumen cupo; éxito resetea). Sesiones JWT expiran a las 12 h.
- `app/(auth)/login/login-client.tsx` + `app/digital-dent-admin-login/admin-login-client.tsx` — Mensaje claro de bloqueo temporal con minutos de espera.
- `app/api/auth/cambiar-password/route.ts` — Política nueva: mínimo 8 caracteres con letra y número; rate limit 5/15min; bcrypt cost 12; rechaza reutilizar la actual.
- `app/api/usuarios/*`, `app/api/admin/clinicas/[id]/reset-admin-password`, `app/cambiar-password/page.tsx`, `mi-cuenta-client.tsx`, `reset-pass-card.tsx` — Mínimo de contraseña subido de 6 a 8 en validaciones y UI.
- `proxy.ts` — Rate limit global de API: 300 req/min por IP (429 + Retry-After).
- `docs/SECURITY.md` (NUEVO) — Postura de seguridad completa, limitaciones conocidas, runbook de incidentes.

**Riesgos / consideraciones:**
- Rate limiting en memoria: efectivo con 1 instancia (configuración actual de Railway). Si se escala a réplicas, migrar a Redis (documentado en SECURITY.md).
- Sesiones existentes emitidas antes del cambio conservan su expiración original (30 días NextAuth default) hasta re-login.
- Contraseñas existentes de 6-7 caracteres siguen funcionando; la política aplica a cambios nuevos.

**Pendientes derivados:**
- 2FA TOTP para super-admin.
- Sentry + UptimeRobot.
- Verificar retención de backups Postgres en Railway.

---

## 2026-06-11 — Fase de maduración comercial: agenda fluida, estados clínicos, anti doble-reserva, Inter + toasts

**Solicitud:** Optimización general pre-lanzamiento: agenda más funcional para uso clínico real, consistencia visual premium (estilo Linear/Notion), estados de carga/error/éxito, sin romper lo existente.

**Archivos modificados:**
- `lib/cita-estados.ts` (NUEVO) — Fuente única de los 7 estados de cita (incluye `EN_ESPERA` y `EN_ATENCION`, label de PENDIENTE pasa a "Agendada"). `siguienteEstado()` define el flujo de recepción.
- `lib/citas.ts` (NUEVO) — `findCitaSolapada()` + `mensajeSolape()`: detección de doble reserva (sobrecupos exentos; CANCELADA/NO_ASISTIO liberan horario).
- `app/api/citas/route.ts` — POST valida solape contra otras citas activas (409 con mensaje claro).
- `app/api/citas/[id]/route.ts` — PATCH: estados nuevos en whitelist, valida solape y bloqueos al reagendar/cambiar doctor, log automático "Reagendada de X a Y".
- `app/(dashboard)/agenda/agenda-client.tsx` — Eliminados todos los `window.location.reload()` (ahora `router.refresh()` + toasts: no se pierden filtros/vista/scroll). Modal nuevo "Editar / Reagendar cita" (fecha, hora, duración, doctor, motivo, notas). Acción principal del flujo destacada en detalle (Confirmar→Llegó→Pasar al sillón→Finalizar) y quick-action por fila en vista Diaria. `saveCita` ahora maneja errores del API (antes los ignoraba). Búsqueda de paciente normaliza tildes. Emojis reemplazados por SVG.
- `components/ui/Toaster.tsx` (NUEVO) — Sistema de toasts global sin dependencias (`toast.success/error/info`), montado en layout dashboard y super-admin.
- `app/layout.tsx` + `app/globals.css` — Tipografía **Inter** vía next/font (toda la app), `tabular-nums` en tablas/montos, focus-visible consistente, `prefers-reduced-motion`.
- `app/(dashboard)/dashboard-client.tsx`, `app/(dashboard)/pacientes/[id]/ficha-client.tsx`, `app/(dashboard)/reportes/reportes-client.tsx` — Estados de cita importados del módulo compartido (labels y colores consistentes; ficha ahora muestra label legible, no la constante).

**Resumen de cambios:**
La agenda pasa de "calendario genérico" a herramienta de recepción: flujo de estados clínicos completo con un clic, edición/reagendado sin salir de la vista, prevención de doble reserva en el backend y feedback inmediato con toasts. Base visual unificada con Inter y tokens.

**Riesgos / consideraciones:**
- `Cita.estado` es String en Prisma → estados nuevos son no-destructivos; datos históricos no cambian.
- Citas que ya estaban solapadas ANTES de este cambio siguen existiendo (la validación es para escrituras nuevas).
- `next/font` descarga Inter en build de Railway (si Google Fonts fallara, el build falla; riesgo bajo, Inter es estable).

**Pendientes derivados:**
- Drag & drop para reagendar directo en el calendario semanal (FullCalendar `editable`).
- Aplicar toasts al resto de módulos que aún usan `alert()`.

---

## Formato de cada entrada

```markdown
## YYYY-MM-DD — Título corto

**Solicitud:** [lo que pidió el usuario, en una línea]

**Archivos modificados:**
- `ruta/archivo.ext` — qué se hizo
- ...

**Resumen de cambios:**
[2–5 líneas sobre qué se hizo y por qué]

**Riesgos / consideraciones:**
- [si aplica]

**Pendientes derivados:**
- [si aplica]
```

---

## 2026-05-14 — Subdominios por clínica + login dual + cambio forzado de contraseña

**Solicitud:** Cada clínica accede por su propia URL (`cumbres.tudominio.cl`, etc.). Al crear una clínica nueva, generar un usuario `Administrador` con contraseña `ADMIN22`, que la plataforma obliga a cambiar en el primer login. Mantener funcionando un modo fallback `/c/<slug>/login` mientras no haya dominio configurado.

**Archivos modificados:**
- `prisma/schema.prisma`:
  - `User`: `email` ahora opcional, +`username String?`, +`passwordChangedAt DateTime?`, `@@unique([clinicaId, username])`.
- `lib/auth.ts`:
  - Login dual: `slug+username+password` (clínica) o `email+password` (super-admin / legacy).
  - JWT/session: añade `clinicaId`, `isPlatformAdmin`, `requirePasswordChange` (true si `passwordChangedAt` es null).
- `proxy.ts`:
  - Detecta subdominio cuando `PLATFORM_DOMAIN` está set. Detecta path `/c/<slug>/...` siempre. Reescribe internamente e inyecta header `x-clinica-slug`. Redirige `/login` al contexto correcto (`/c/<slug>/login` si vino por path).
- `lib/clinica-context.ts`: helper `getClinicaSlugFromContext()` para server components.
- `app/(auth)/login/page.tsx` + `login-client.tsx`: formulario adaptativo según haya slug en el header.
- `app/api/admin/clinicas/route.ts`: auto-crea usuario `Administrador` con hash de `ADMIN22` y `passwordChangedAt: null`. Devuelve `credenciales` con `url_subdominio`, `url_fallback`, `usuario`, `contrasena`.
- `app/digital-dent-super-admin/clinicas/nueva/page.tsx`: formulario simplificado (sin campos de admin/email/password); muestra credenciales generadas con botones de copiar.
- `app/(dashboard)/layout.tsx`: redirige a `/cambiar-password` si `requirePasswordChange`.
- `app/cambiar-password/page.tsx` + `app/api/auth/cambiar-password/route.ts`: UI y endpoint para cambio forzado de contraseña; tras éxito hace `signOut` para refrescar el JWT.
- `prisma/seed-admin-existing-clinics.ts`: script idempotente para crear `Administrador` en clínicas activas existentes.
- `docs/DNS_SETUP.md`: guía completa de DNS, wildcard, `PLATFORM_DOMAIN`, modo path vs subdominio.
- Eliminados: `app/(auth)/registro/`, `app/api/clinicas/` (registro público — sólo super-admin crea clínicas ahora).

**Resumen de cambios:**
La plataforma ahora es de verdad multi-tenant con login segmentado por clínica. Cada clínica recibe una URL única (`cumbres.tudominio.cl` cuando haya dominio, `/c/cumbres/login` mientras tanto) y un usuario `Administrador` con clave temporal `ADMIN22` que debe cambiarse al entrar. El header `x-clinica-slug` injectado por el middleware permite al formulario de login y a los server components conocer el tenant sin sesión previa. El modo subdominio se activa con la env `PLATFORM_DOMAIN`; ambos modos conviven.

**Riesgos / consideraciones:**
- Se aplicó `prisma db push --accept-data-loss` contra Railway: campos `username` y `passwordChangedAt` agregados a `User`, `email` ahora nullable. El `Administrador` para la clínica `digital-dent` existente se creó vía `seed-admin-existing-clinics.ts`.
- Para activar subdominios falta: comprar dominio, apuntar wildcard `*.tudominio.cl` a Railway, configurar `PLATFORM_DOMAIN` en variables. Documentado en `docs/DNS_SETUP.md`.
- `NEXTAUTH_URL` actualmente apunta a `digital-dent-production.up.railway.app`; al migrar a dominio propio debe actualizarse.
- Las cookies de NextAuth son por dominio: cada subdominio tendrá su propia sesión (deseado).

**Pendientes derivados:**
- Apagar Vercel y rotar credenciales de Neon (la plataforma vive 100% en Railway ahora).
- Cuando exista el dominio: añadir custom domain + wildcard en Railway, setear `PLATFORM_DOMAIN`, actualizar `NEXTAUTH_URL`.
- Validación de slug en superadmin: avisar si el slug colisiona con un subdominio reservado (www, app, api, etc.).

---

## 2026-05-13 — Módulo Pacientes rediseñado (Fase 2A)

**Solicitud:** Mejorar listado de pacientes con fila expandible mostrando indicadores (RUT, email, teléfono, convenio, tratamientos activos/finalizados/expirados, recaudación). Rediseñar ficha del paciente con tabs principales (Datos personales / Ficha clínica / Planes / Facturación / Recibir pago), subtabs (Datos / Citas / Comentarios administrativos / Mensajes — omitir "Tareas de gestión"), indicadores médicos en el header (Alertas / Enfermedades / Medicamentos), y historial unificado de mensajes (emails con planes, documentos, recetas + confirmaciones WhatsApp).

**Archivos modificados:**
- `prisma/schema.prisma`:
  - `Paciente`: +18 campos (numero correlativo, nombreSocial, sexo, nacionalidad, migrante, puebloOriginario, telefonoFijo, ciudad, comuna, actividad, empleador, apoderado, rutApoderado, referencia, tipoPaciente, numeroInterno, otroDocId). `@@unique([clinicaId, numero])`.
  - `FichaClinica`: +`alertasMedicas`, +`enfermedadesNotas` (texto libre).
  - Nuevo `ComentarioAdministrativo` (autor + texto + timestamp por paciente).
  - Nuevo `MensajePaciente` (tipo EMAIL/WHATSAPP/SMS × categoría CONFIRMACION_CITA/PLAN_TRATAMIENTO/DOCUMENTO/RECETA/OTRO).
- `prisma/seed-multi-tenant.ts` — asigna `numero` correlativo a pacientes existentes por clínica, ordenados por `createdAt`.
- `app/api/pacientes/route.ts` — POST asigna `numero` automáticamente. Acepta todos los nuevos campos.
- `app/api/pacientes/[id]/route.ts` — PATCH con todos los campos nuevos.
- `app/api/pacientes/[id]/comentarios/route.ts` — creado. GET/POST con autor de la sesión.
- `app/api/pacientes/[id]/mensajes/route.ts` — creado. GET/POST.
- `app/(dashboard)/pacientes/page.tsx` — incluye tratamientos, cobros y presupuestos para calcular KPIs por paciente.
- `app/(dashboard)/pacientes/pacientes-client.tsx` — listado completo rediseñado: filtros (búsqueda, número, tratamientos con/sin), tabla con columnas #/Nombre/Apellidos/Tratamientos/Deudas, fila expandible al click con avatar + contacto + KPIs tratamientos + recaudación + links rápidos.
- `app/(dashboard)/pacientes/[id]/page.tsx` — incluye comentarios admin y mensajes en el query.
- `app/(dashboard)/pacientes/[id]/ficha-client.tsx` — reescrito completo:
  - Header azul con ID, avatar, nombre, RUT, edad, previsión.
  - 3 indicadores médicos (Alertas / Enfermedades / Medicamentos) que cambian color si tienen contenido.
  - 5 tabs principales: Datos personales | Ficha clínica | Planes de tratamiento | Facturación y pagos | Recibir pago.
  - Acciones Agendar (→ /agenda?pacienteId) y Historia clínica (→ print plan).
  - Subtabs de Datos personales: Datos | Citas (N) | Comentarios | Mensajes (N).
  - Formulario completo con todos los campos nuevos (datos requeridos + opcionales).
  - Comentarios: textarea + listado con autor y fecha.
  - Mensajes: timeline con badge tipo (EMAIL/WHATSAPP/SMS) + categoría + estado.

**Resumen de cambios:**
Módulo pacientes pasa de un listado simple + ficha plana a una experiencia rica como SaaS comercial. El listado da overview rápido con todo lo importante al expandir una fila. La ficha tiene la profundidad necesaria para que un doctor opere todo desde un solo lugar. Comentarios administrativos y historial de mensajes son trazables para auditoría.

**Riesgos / consideraciones:**
- `numero` correlativo se asigna en el seed (existentes) y en el POST (nuevos). Si dos POST llegan al mismo milisegundo a la misma clínica, podrían colisionar por `@@unique([clinicaId, numero])`. Aceptable por la baja concurrencia esperada en una clínica.
- El historial de mensajes está listo para recibir entradas pero **nadie las crea automáticamente todavía**. Cuando enviemos confirmaciones WhatsApp en el módulo agenda, hay que insertar en `MensajePaciente`. Pendiente para integración real.
- "Tareas de gestión" omitido por pedido explícito del usuario.
- La edición de la ficha clínica completa (alergias, enfermedades, medicamentos) aún es solo lectura — el formulario completo de ficha clínica es Fase 2B.

**Pendientes derivados:**
- Editor completo de ficha clínica (alertas, enfermedades, medicamentos editable).
- Auto-registrar mensajes WhatsApp al confirmar cita.
- Auto-registrar email cuando se envía presupuesto/plan.
- Pre-seleccionar paciente en `/agenda?pacienteId=X` (hoy el query string llega pero no se usa en agenda).

---

## 2026-05-13 — Panel super-admin: crear clínicas + detalle enriquecido

**Solicitud:** Tras feedback de uso del panel: quitar KPIs operativos del dashboard global (no le interesan citas/usuarios/pacientes globales), agregar opción para crear clínicas desde el panel, y en el detalle de cada clínica mostrar: detalle de plan + cobros mensuales, resumen de pacientes con/sin agenda, y almacenamiento usado.

**Archivos modificados:**
- `lib/plans.ts` — creado. `PLAN_PRICES` (TRIAL 0, BASICO 19900, PRO 39900 CLP), `PLAN_LABELS`, `PLAN_DESCRIPCIONES`.
- `app/digital-dent-super-admin/page.tsx` — simplificado: 4 KPIs (activas/trial/suspendidas/total) + tarjeta destacada de MRR estimado.
- `app/api/admin/clinicas/route.ts` — creado. POST protegido por `requireSuperAdmin` para crear clínica desde panel con plan y días de trial configurables.
- `app/digital-dent-super-admin/clinicas/nueva/page.tsx` — creado. Formulario completo: datos clínica + admin inicial + selector visual de plan + días trial.
- `app/digital-dent-super-admin/clinicas/clinicas-list-client.tsx` — botón "Nueva clínica" en el header del listado.
- `app/digital-dent-super-admin/clinicas/[id]/page.tsx` — añadidas queries: `pacientesConAgenda`, `pacientesSinAgenda`, `cobrosUltimos90Dias`, storage placeholder con cuota según plan.
- `app/digital-dent-super-admin/clinicas/[id]/clinica-detail-client.tsx` — 4 secciones nuevas:
  - **Suscripción**: plan, cobro mensual, trial vence / próximo cobro.
  - **Pacientes**: total, con citas, sin citas, + nota de usuarios y citas totales.
  - **Cobros a pacientes**: histórico, últimos 90 días, # cobros.
  - **Almacenamiento**: barra de progreso con cuota por plan (TRIAL 1GB, BASICO 10GB, PRO 50GB), placeholder a 0 B.

**Resumen de cambios:**
El panel super-admin ahora es un control plane real:
- Dashboard global con foco en negocio (clínicas + MRR).
- Crear clínica desde adentro sin pasar por `/registro` público.
- Detalle de cada clínica muestra: cuánto paga (estimado), cómo usan la plataforma (pacientes con/sin agenda), cuánto cobran a sus pacientes, y cuánto storage consumen.

Las cuotas de storage están hardcodeadas en código (no en DB); cuando exista módulo de archivos en Fase 2, calcular `bytesUsados` real sumando los archivos por clínica.

**Riesgos / consideraciones:**
- `PLAN_PRICES` es hardcoded. Sería mejor en DB cuando llegue la pasarela (Fase 4) para que el super-admin pueda editar precios.
- Storage es siempre 0 hasta Fase 2.
- Las cuotas (1/10/50 GB) son arbitrarias — ajustar cuando definamos packaging real.
- `pacientesSinAgenda` se calcula como `total - conAgenda`, lo cual es correcto pero asume que ambas queries son consistentes (no hay concurrencia entre ellas).

**Pendientes derivados:**
- Editar `PLAN_PRICES` desde el panel (modelo `Plan` en DB).
- Tracking de cobros mensuales reales (cuando exista pasarela).
- Storage real cuando exista módulo de archivos.
- Modo "impersonar" para soporte.

---

## 2026-05-13 — Panel super-admin /digital-dent-super-admin (Fase 1B)

**Solicitud:** Crear panel para gestionar todas las clínicas (control plane), dejarlo en URL `/digital-dent-super-admin`, renombrar "Digital-Dent" en login/registro a algo genérico (el usuario decidirá nombre comercial después), y crear usuario super-admin con credenciales para entrar.

**Archivos modificados:**
- `prisma/seed-super-admin.ts` — creado. Idempotente. Lee `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD` del env. Si user existe, solo asegura `isPlatformAdmin=true`. Si no existe, lo crea.
- `package.json` — build incluye `seed-super-admin` después de `seed-multi-tenant`.
- `lib/auth.ts` — `isPlatformAdmin` en JWT y session. Helper `requireSuperAdmin()`.
- `app/digital-dent-super-admin/layout.tsx` — guard que redirige a `/login` o `/` si no es super-admin.
- `app/digital-dent-super-admin/topbar.tsx` — nav oscura con Dashboard / Clínicas / Salir.
- `app/digital-dent-super-admin/page.tsx` — dashboard con 8 KPIs globales (clínicas activas / en trial / suspendidas, usuarios, pacientes, citas totales y del mes, volumen cobrado) + tabla últimas 5 clínicas.
- `app/digital-dent-super-admin/clinicas/page.tsx` + `clinicas-list-client.tsx` — listado con buscador y filtros por plan / estado.
- `app/digital-dent-super-admin/clinicas/[id]/page.tsx` + `clinica-detail-client.tsx` — detalle con métricas, editor inline de datos y botón suspender/reactivar.
- `app/api/admin/clinicas/[id]/route.ts` — GET/PATCH protegidos por `requireSuperAdmin`.
- `app/api/auth/whoami/route.ts` — endpoint para que el login decida destino.
- `app/(auth)/login/page.tsx` — post-login consulta whoami y redirige a `/digital-dent-super-admin` o `/`. Renombrado "Digital-Dent" → "Plataforma Dental".
- `app/(auth)/registro/page.tsx` — renombrado a "Plataforma Dental".
- `app/(dashboard)/layout.tsx` — si usuario es platform admin, redirige al panel.
- `.gitignore` — añadido `*.tmp` para evitar commits accidentales del archivo de mensaje.

**Resumen de cambios:**
URL del panel: `/digital-dent-super-admin`. Visualmente oscuro (slate-900 + acento púrpura) para distinguir del dashboard de clínica. Acceso restringido por `isPlatformAdmin === true`. Dashboard muestra KPIs globales y listado/detalle de cada clínica permite editar datos, cambiar plan y suspender. El super-admin **no pertenece a ninguna clínica** (`clinicaId = null`), por lo que el dashboard normal lo redirige automáticamente al panel.

**Cómo crear el super-admin (instrucciones al usuario):**
Añadir en Vercel → Settings → Environment Variables (producción):
- `SUPER_ADMIN_EMAIL=superadmin@digital-dent.cl` (o el email que prefiera)
- `SUPER_ADMIN_PASSWORD=<password segura>`

Tras redeploy, el seed crea el user. Login en `/login` con esas credenciales redirige al panel.

**Riesgos / consideraciones:**
- `isPlatformAdmin` no tiene UI para auto-elevación — solo via seed/SQL directo.
- Si las env vars faltan, el seed termina sin error (no bloquea build, pero tampoco crea super-admin).
- El password en env vars de Vercel está cifrado en reposo, pero si alguien tiene acceso al proyecto Vercel lo puede leer. Aceptable para el caso.
- Modo "impersonar como admin de clínica" no implementado — pendiente para Fase 1B+.

**Pendientes derivados:**
- Modo impersonar (super-admin entra como admin de cualquier clínica sin saber su password).
- Storage por clínica (cuando exista módulo de archivos en Fase 2).
- Métrica "último login del admin de la clínica".
- Botón "extender trial" en detalle de clínica.

---

## 2026-05-13 — Multi-tenancy (Fase 1)

**Solicitud:** Convertir la plataforma de single-tenant a SaaS multi-tenant para vender a múltiples clínicas, manteniendo aislamiento de datos por clínica.

**Archivos modificados:** 50 archivos. Resumen:
- `prisma/schema.prisma` — Nuevo modelo `Clinica`. `clinicaId` nullable en cada modelo de datos. `@@unique([clinicaId, rut])` en Paciente, `@@unique([clinicaId, numero])` en Presupuesto y Cobro. `isPlatformAdmin` añadido a User para Fase 1B.
- `prisma/seed-multi-tenant.ts` — creado. Crea clínica "Clínica Digital-Dent" copiando datos del singleton `Configuracion`, y asigna todos los registros huérfanos a esa clínica.
- `lib/auth.ts` — JWT y session incluyen `clinicaId`. Helpers `getSessionUser()` y `requireClinicaId()`.
- `app/api/clinicas/route.ts` — creado. POST público para registro de clínica nueva + admin + copia del catálogo de la plantilla.
- `app/api/clinica/route.ts` — creado. GET/PATCH datos de la clínica actual.
- `app/api/configuracion/route.ts` — convertido en pasarela legacy al modelo `Clinica`.
- **15+ endpoints API** — todos filtran por `clinicaId` en GET/PATCH/DELETE y lo asignan en POST.
- **10+ páginas server-component** — agenda, pacientes, presupuestos, cobros, prestaciones, liquidaciones, usuarios, configuración: queries scope por clínica.
- **3 páginas print** — header dinámico con datos de la clínica del usuario.
- `app/(auth)/registro/page.tsx` — creado. Onboarding en 2 pasos (datos clínica → admin).
- `app/(auth)/login/page.tsx` — añadido link a /registro.
- `proxy.ts` — `/registro` y `/api/clinicas` son ahora públicos.
- `app/(dashboard)/layout.tsx` — carga la clínica del usuario; redirige si suspendida/sin clínica.
- `package.json` — build script reemplaza `seed-aranceles` por `seed-multi-tenant`.

**Resumen de cambios:**
La plataforma deja de ser single-tenant. Cada clínica es un tenant aislado con sus propios usuarios, pacientes, citas, aranceles, presupuestos, etc. El JWT lleva `clinicaId` y cada query filtra automáticamente por ese scope. Una clínica nueva se registra públicamente en `/registro`, recibe 30 días de trial, hereda el catálogo de aranceles de la plantilla, y se loguea automáticamente al terminar el flujo. Los datos existentes (3.980 pacientes, 764 prestaciones, etc.) quedan asignados a la "Clínica Digital-Dent" inicial creada por el seed.

**Decisiones técnicas confirmadas (6 puntos):**
1. RUT de paciente único por clínica (no global).
2. Aranceles propios por clínica (copia inicial desde plantilla).
3. Email de usuario único global.
4. Trial de 30 días al registrarse.
5. Login simple: cada usuario pertenece a una sola clínica.
6. Migración: nueva clínica "Clínica Digital-Dent" recibe todos los datos legacy.

**Riesgos / consideraciones:**
- `clinicaId` queda **nullable** en DB por la migración suave. A nivel de código siempre se valida que esté presente. Endurecer a NOT NULL en un segundo commit una vez verificada la migración en producción.
- El cliente Prisma local no se pudo regenerar (`.dll` bloqueado en Windows). Vercel lo regenera limpio en cada build, así que typecheck local muestra errores irreales pero el build de Vercel funcionará.
- `seed-aranceles.ts` ya no corre en cada build. Las 764 prestaciones quedaron asignadas a la clínica inicial. Clínicas nuevas reciben copia.
- Los `numero` correlativos de Presupuesto/Cobro siguen sin transacción explícita. Bajo concurrencia alta de dos usuarios creando al mismo tiempo en la misma clínica podría colisionar. Aceptable para clínicas pequeñas.
- El modelo `Configuracion` legacy se mantiene; eliminarlo en una segunda fase.

**Pendientes derivados:**
- **Fase 1B: Panel super-admin `/admin`** — pendiente. UI para gestionar todas las clínicas: listado, métricas, suspender, almacenamiento usado. Campo `isPlatformAdmin` ya añadido al schema.
- Fase 2: Módulo de archivos (radiografías, documentos).
- Fase 3: Migración a Hetzner.
- Fase 4: Pasarela de pagos.

---

## 2026-05-12 — RUT de paciente opcional + dedupe contra DB en import

**Solicitud:** Permitir importar (y crear) pacientes sin RUT, manteniendo la unicidad: si traen RUT y ya existe en la base, no importar esa fila.

**Archivos modificados:**
- `prisma/schema.prisma` — `Paciente.rut` cambió de `String @unique` a `String? @unique`. Postgres permite múltiples NULLs en una columna UNIQUE, así que la unicidad solo aplica a RUTs no-null.
- `app/api/pacientes/import/route.ts` — quitado el error "Falta RUT": ahora valida solo Nombres y Apellidos. Si la fila trae RUT, se normaliza y se dedupea dentro del archivo. Antes del `createMany`, consulta los RUTs no-null contra DB y descarta los que ya existen contándolos como `duplicados`. Añadido contador `sinRut` en la respuesta.
- `app/api/pacientes/route.ts` — POST acepta `rut` vacío → guarda `null`.
- `app/api/pacientes/export/route.ts` — `formatRUT` local maneja `null`.
- `lib/utils.ts` — `formatRUT` ahora acepta `string | null | undefined` y devuelve string vacío si no hay rut.
- `app/(dashboard)/pacientes/pacientes-client.tsx` — interface `rut: string | null`, filtro con `?? ''`, render con guard "—", form con label "RUT (opcional)" sin `required`, modal con grid 2×2 que incluye "Importados sin RUT".
- `app/(dashboard)/pacientes/[id]/ficha-client.tsx` — render "Sin RUT registrado" en encabezado y "—" en tabla de datos personales si no hay rut.
- `app/(dashboard)/agenda/agenda-client.tsx` — tipo `Cita.pacienteRut: string | null`, prop `pacientes` con rut nullable, filtro con `?? ''`, render "Sin RUT" en buscador, label "RUT (opcional)" en form, `canSave` ya no exige rut en modo "nuevo".
- `app/print/presupuesto/page.tsx`, `app/print/plan/page.tsx` — la línea "RUT:" se oculta si el paciente no tiene rut.

**Resumen de cambios:**
La unicidad de RUT se preserva: Postgres trata múltiples NULL como distintos, así que `@unique` sigue funcionando para los pacientes que sí tienen RUT, y los sin-RUT pueden ser N. El endpoint de import ahora hace dos chequeos: dedupe dentro del archivo (RUT duplicado en archivo → error de fila) y dedupe contra DB (RUT ya existente → cuenta como duplicado, no se inserta). `createMany skipDuplicates` queda como red de seguridad para condiciones de carrera.

**Riesgos / consideraciones:**
- `prisma db push --accept-data-loss` en el build de Vercel ejecuta `ALTER TABLE Paciente ALTER COLUMN rut DROP NOT NULL`. Operación segura sin pérdida de datos.
- El cliente Prisma local no se pudo regenerar (`.dll` bloqueado en Windows), por eso `tsc --noEmit` aún ve `rut: string`. No es bloqueante: Vercel hace `prisma generate` limpio en cada build.
- Algunos doctores/pacientes pueden coexistir sin RUT — si en el futuro se quiere validar dígito verificador del RUT, hacerlo *solo cuando se proporciona*.

**Pendientes derivados:**
- Verificar el deploy y probar importación con archivos que contengan filas sin RUT.
- Opcional: filtros en /pacientes para listar "Sin RUT" y completar manualmente más tarde.

---

## 2026-05-12 — Importación/exportación de pacientes (Excel)

**Solicitud:** En `/pacientes`: botón para subir archivo y cargar base de pacientes, otro para descargar plantilla base con columnas (Nombres, Apellidos, Teléfono, Dirección, Correo Electrónico, RUT, Fecha de Nacimiento), y otro para exportar la base actual a Excel.

**Archivos modificados:**
- `package.json` — agregada dependencia `xlsx` (SheetJS).
- `app/api/pacientes/template/route.ts` — creado. GET. Genera `plantilla-pacientes.xlsx` con cabeceras + fila de ejemplo.
- `app/api/pacientes/export/route.ts` — creado. GET. Exporta toda la tabla `Paciente` (ordenada por apellido, nombre) a `pacientes-YYYY-MM-DD.xlsx`. Incluye campos adicionales: previsión, género, activo, creado.
- `app/api/pacientes/import/route.ts` — creado. POST multipart `file`. Lee xlsx/xls/csv, normaliza RUT (`12345678-9`), parsea fecha flexible (ISO, dd/mm/yyyy, serial de Excel), valida nombre/apellido/RUT, detecta duplicados en archivo, usa `prisma.paciente.createMany({ skipDuplicates: true })` para evitar choque con RUTs ya existentes. Retorna `{ total, creados, duplicados, errores[] }`.
- `app/(dashboard)/pacientes/pacientes-client.tsx` — añadidos 3 botones (Plantilla / Importar / Exportar Excel) en el header. Modal de resultado de importación con KPIs (filas, creados, duplicados) y listado de errores por fila. Recarga la tabla si hubo creados.

**Resumen de cambios:**
Tres endpoints serverless usando `xlsx` (SheetJS). Template usa nombres de columnas exactos solicitados (con tilde y ñ). Importación es **idempotente por RUT**: si un paciente ya existe en DB se cuenta como duplicado y no rompe el flujo. El parser de fecha acepta tres formatos comunes (ISO, dd/mm/yyyy, serial numérico de Excel) más fallback a `new Date()`. Auth verificada con `getServerSession` en los 3 endpoints.

**Riesgos / consideraciones:**
- `xlsx` tiene 3 vulnerabilidades conocidas (1 moderada, 2 altas) por CVE de prototype pollution y ReDoS — aceptables en un endpoint autenticado con archivos de clínica. Si más adelante se exigiera depurar, alternativa es migrar a `exceljs`.
- `prisma.paciente.createMany({ skipDuplicates: true })` requiere Postgres (en SQLite no funciona). El proyecto ya corre Postgres en prod, así que ok.
- Import no actualiza pacientes existentes — solo crea nuevos. Si el cliente necesita "merge/upsert", hay que iterar y hacer `upsert` (más lento, pero posible).
- El cliente Prisma local quedó desactualizado y `prisma generate` falla por `.dll` bloqueado en Windows — no bloquea Vercel pero hay que regenerarlo localmente cuando se quiera correr `tsc` limpio.

**Pendientes derivados:**
- Verificar deploy en Vercel y probar import con archivo real.
- Opcional: añadir botón "Reemplazar existentes" que haga upsert en lugar de skipDuplicates.
- Opcional: validar formato de RUT chileno con dígito verificador antes de aceptar (hoy solo se normaliza, no se valida el DV).

---

## 2026-05-12 — Sistema de continuidad documental

**Solicitud:** Preparar el proyecto para trabajo prolongado sin perder contexto entre sesiones, compactaciones o reinicios. Crear `CLAUDE.md` + 4 documentos en `docs/`.

**Archivos modificados:**
- `CLAUDE.md` (raíz) — sobrescrito con guía de sesión (objetivo, arquitectura, stack, convenciones, reglas, comandos).
- `docs/PROJECT_CONTEXT.md` — creado. Contexto completo: problema, stack, modelos, flujos, decisiones, funcionalidades, puntos delicados.
- `docs/PROJECT_STATUS.md` — creado. Estado actual: qué funciona, qué cambió, qué falta, errores conocidos, próximos pasos.
- `docs/AI_CHANGELOG.md` — creado (este archivo).
- `docs/SESSION_HANDOFF.md` — creado. Plantilla de traspaso entre sesiones.

**Resumen de cambios:**
Sólo documentación. No se tocó código funcional, schema, dependencias ni rutas. El objetivo es que cualquier sesión futura de Claude pueda reabrir el proyecto leyendo `CLAUDE.md` → `docs/SESSION_HANDOFF.md` → `docs/PROJECT_STATUS.md` y retomar sin depender del historial de chat.

**Riesgos / consideraciones:**
- Ninguno funcional. Mantenimiento: hay que actualizar `SESSION_HANDOFF.md` y `PROJECT_STATUS.md` al final de cada tarea importante o el sistema pierde valor rápido.

**Pendientes derivados:**
- Próxima tarea real: importación/exportación de pacientes en `/pacientes`.

---

## 2026-05-12 — Carga del arancel real (764 prestaciones)

**Solicitud:** Importar el arancel dental depurado (`Arancel depurado 05 26.txt`, UTF-16 LE, tab-separado) al catálogo de Prestaciones, organizado por categoría y precio.

**Archivos modificados:**
- `prisma/seed-aranceles.ts` — creado. 791 líneas con 764 prestaciones distribuidas en 24 categorías. Idempotente vía `createMany({ skipDuplicates: true })`.
- `package.json` — modificado el script `build` para incluir el seed antes de `next build`:
  `prisma db push --accept-data-loss && prisma generate && ts-node --transpile-only prisma/seed-aranceles.ts && next build`

**Resumen de cambios:**
Se parseó el TXT UTF-16 LE chileno (precio formato `$29.900`, `$-` = 0), se generó un seed TypeScript con todas las prestaciones, y se integró al pipeline de Vercel para que el catálogo se sincronice en cada deploy sin riesgo de duplicar registros.

**Riesgos / consideraciones:**
- El seed corre en cada build. Si se corrompe, ningún deploy podrá completarse.
- `--transpile-only` salta type-checking del seed; cualquier error de tipos solo aparecerá en runtime.
- Local dev con SQLite no permite correr el seed (schema = postgresql).

**Pendientes derivados:**
- Verificar que el deploy de Vercel haya creado las 764 prestaciones en la DB de producción.

---

<!-- Plantilla para próximas entradas (copiar arriba del histórico):

## YYYY-MM-DD — Título corto

**Solicitud:**

**Archivos modificados:**
-

**Resumen de cambios:**

**Riesgos / consideraciones:**
-

**Pendientes derivados:**
-

-->
