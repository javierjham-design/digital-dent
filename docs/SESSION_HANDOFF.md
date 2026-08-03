# Session Handoff

> **Leé este archivo PRIMERO al iniciar una sesión.** Resume dónde quedó el trabajo,
> sin depender del historial de chat anterior.

---

## Última actualización

- **Fecha:** 2026-08-03
- **Rama:** `chore/limpieza-monolito` (sale de `arch/split-frontend-backend`, commit `67b0332`).
- **Foco de esta sesión:** auditoría del proyecto + limpieza del código muerto.

---

## Estado: EN PRODUCCIÓN

El stack nuevo está vivo en Railway (proyecto `amused-recreation`), desplegando desde
`arch/split-frontend-backend`, con **dos clínicas reales usándolo a diario**.

- **Backend** → `api.clariva.cl` · **Frontend** (app clínicas) → `*.clariva.cl`
  (subdominio por clínica) · **Web/landing** → `clariva.cl` + `www`. DNS en Cloudflare
  (registros en gris/DNS-only; el wildcard obligatorio gris).
- **Postgres:** un servidor, con `clariva_control` (control-plane) + una base física por
  clínica (`clariva_t_<slug>`). Aislamiento **físico** entre clínicas.
- **Crons:** ver "A verificar" más abajo.

## Qué pasó desde el cutover (2026-06-20 → 2026-07-31)

Seis semanas de trabajo de producto que no estaban registradas en este archivo. El detalle
está en `docs/AI_CHANGELOG.md` (entradas más recientes arriba); en grueso:

CRM con Meta Lead Ads (webhook nativo, identidad por teléfono normalizado, eventos de
ciclo al CAPI, merge de duplicados) · agendamiento online público y reserva de leads ·
consentimientos y documentos clínicos · planes de tratamiento (finalizar/reabrir,
auto-consulta, pestaña Finalizados, evolución con trazabilidad) · pacientes dar de
baja/reactivar y aviso proactivo de RUT duplicado · recaudación (cobro de varios planes en
un pago, abono libre como pie, segundo medio de pago) · gestión de cajas y boxes ·
suscripciones y pagos con Flow · permisos granulares por usuario (el último:
`puedeGestionarAgenda`).

## Limpieza hecha hoy (2026-08-03)

Rama `chore/limpieza-monolito`, tres commits:

1. **`.gitattributes` + renormalización a LF.** Los 41 archivos que aparecían modificados
   eran ruido CRLF/LF, no cambios reales (verificado con `git diff --ignore-cr-at-eol`,
   que daba vacío). El `git status` ahora queda limpio y los cambios verdaderos se ven.
2. **Eliminado el monolito Next.js** (219 archivos, ~42.000 líneas): `app/`, `components/`,
   `lib/`, `prisma/`, `public/`, `proxy.ts`, `next.config.ts`, `postcss.config.mjs`,
   `next-env.d.ts`, `eslint.config.mjs`, `tsconfig.json`, `package.json`,
   `package-lock.json`, `AGENTS.md`. Estaba muerto desde el cutover pero seguía versionado.
   Preservado en el tag **`monolito-final`** (`67b0332`) y en un `.tar.gz` fuera del repo.
   Para recuperar cualquier archivo: `git show monolito-final:<ruta>`.
3. **`CLAUDE.md` reescrito** para el stack real (antes describía el monolito: base
   compartida con `clinicaId`, NextAuth, `prisma/` en la raíz — nada de eso existe hoy).

Verificado antes de borrar: ningún servicio construye desde la raíz (no hay `railway.json`
ahí), el alias `@/` de frontend apunta a su propio `src`, ningún tsconfig del stack nuevo
extiende el de la raíz, el monolito no importaba `shared/`, `scripts/*.mjs` solo usa
builtins de node, y las prestaciones de una clínica nueva salen de
`backend/src/lib/verticales.ts` (no del `seed-aranceles.ts` que se borró).

> **Dato a no perder:** el arancel chileno de 764 prestaciones vivía en
> `prisma/seed-aranceles.ts` y hoy no lo usa nadie. Si alguna vez se quiere sembrar
> clínicas nuevas con el arancel real:
> `git show monolito-final:prisma/seed-aranceles.ts > backend/src/data/aranceles-cl.ts`

### Qué falta cerrar de la limpieza

- Mergear `chore/limpieza-monolito` → `arch/split-frontend-backend`.
- **Borrar a mano** la carpeta `_to_delete/` de la raíz (contiene el monolito movido y
  locks de git; está en `.gitignore`), más `node_modules/`, `.next/` y
  `monolito-final.tar.gz` de la raíz. No se borraron desde la sesión porque el puente de
  archivos no permite `rm`.
- **No se pudo verificar con typecheck ni tests:** `node_modules` está instalado para
  Windows y no corre en el entorno de la sesión. Antes de mergear, correr en local:
  `npm --prefix backend run typecheck`, `npm --prefix backend test`,
  `npm --prefix frontend run typecheck`, `npm --prefix web run typecheck`.

## A verificar (fuera del repo, no lo pude comprobar desde la sesión)

1. **Crons en Railway.** El workflow `.github/workflows/clariva-cron.yml` está solo en
   `arch/split-frontend-backend`, y GitHub dispara `schedule` únicamente desde la rama por
   defecto (`master`, congelada en `528cc54` del 2026-06-15). Por ese camino no corre nada.
   El otro camino son los cron services de Railway (`docs/deploy-extras.md`): `cron/railway.json`
   trae `cronSchedule: "0 6 * * *"`, así que `cleanup` puede estar activo, pero `sync`
   (Google Calendar, cada 15 min) y `recordatorios` necesitan **cada uno su propio servicio**.
   Si `sync` no existe, la agenda no se sincroniza con Google desde el cutover.
2. **Google OAuth:** ¿sigue en modo *Testing*? En ese modo Google caduca los refresh tokens
   a los 7 días y la integración se rompe sola cada semana. Sacarlo tarda 1–6 semanas.
3. **Backups de Postgres en Railway:** qué está activo y con qué retención.

## Prioridades (detalle en `docs/AUDITORIA_2026-08.md`)

1. Verificar los crons de Railway (30 min).
2. **Backups lógicos por clínica + restore probado** — prompt listo para pegar en
   `docs/PROMPT_BACKUPS.md`. Los backups de Railway restauran el volumen entero (a las dos
   clínicas juntas) y retienen 6 días.
3. Sentry + `/health` con `SELECT 1` + UptimeRobot.
4. Aserción defensiva en `dropTenantDatabase`.
5. Correlativo de cobros dentro de la transacción (`cobros.service.ts:185`).
6. LRU en el caché de clientes por tenant (`db/tenant.ts`) — techo a ~30 clínicas.

## Notas

- `docs/PROJECT_STATUS.md` y `docs/PROJECT_CONTEXT.md` son del monolito y están obsoletos;
  no los uses como fuente de verdad. Sirven: este archivo, `docs/AI_CHANGELOG.md`,
  `docs/architecture.md` (con su tabla de etapas ya cerrada) y `docs/AUDITORIA_2026-08.md`.
- Pendiente de fondo: mergear `arch → master` y retirar lo que quede del monolito en
  Railway. Eso activa además los crons de GitHub Actions.
