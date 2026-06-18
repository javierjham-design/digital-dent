# Extras de despliegue: Docker y Cron

Complementan `docs/cutover.md`. Opcionales: NIXPACKS (default en los `railway.json`)
funciona sin esto; usa Docker solo si NIXPACKS no detecta bien el monorepo.

## A. Opción Docker (alternativa a NIXPACKS)

Hay un `Dockerfile` por servicio: `backend/`, `frontend/`, `web/`. **El contexto de
build debe ser la raíz del repo** (porque backend y frontend importan `../shared`).

En Railway, por cada servicio:
1. Settings → **Root Directory = vacío** (raíz del repo `dental-platform/`).
2. Settings → Build → **Dockerfile Path** = `backend/Dockerfile` (o `frontend/Dockerfile`, `web/Dockerfile`).
3. Las variables del servicio se siguen poniendo igual. Para frontend/web, las
   `VITE_*` se inyectan como **build args** automáticamente (los Dockerfiles las
   declaran con `ARG`/`ENV`).

> Si dejas Root Directory en `backend/` el `COPY shared` fallará (no está en el
> contexto). Por eso el contexto es la raíz + Dockerfile Path.

`.dockerignore` (en la raíz) excluye `node_modules`, `dist`, artefactos de test, etc.

## B. Cron (tareas programadas)

Paquete `cron/`: un solo script (`run.mjs`) que hace `POST` al backend según la
variable `JOB`. Crea **un servicio Railway por job** (mismo repo, Root Directory =
`cron/`), cada uno con su `cronSchedule` y su `JOB`.

Variables de cada servicio cron:
| Variable | Valor |
|----------|-------|
| `API_URL` | `https://api.clariva.cl` (base del backend, sin `/api/v1`) |
| `CRON_SECRET` | el mismo `CRON_SECRET` del backend |
| `JOB` | `cleanup` · `recordatorios` · `sync` |

Schedules sugeridos (Settings → Cron Schedule, o `cronSchedule` en railway.json):
| JOB | Qué hace | Schedule |
|-----|----------|----------|
| `cleanup` | borra clínicas demo expiradas | `0 6 * * *` (diario 06:00) |
| `recordatorios` | recordatorios de cita por WhatsApp | `*/20 * * * *` (cada 20 min) |
| `sync` | sincroniza Google Calendar | `*/15 * * * *` (cada 15 min) |

`cron/railway.json` trae `restartPolicyType: NEVER` (un job corre y termina) y un
schedule por defecto (`cleanup` diario). Si hoy no usas WhatsApp ni Google, con el
servicio `cleanup` basta; agrega los otros al activar esas integraciones.

Probar un job manualmente:
```
curl -X POST https://api.clariva.cl/api/v1/demo/cleanup -H "x-cron-secret: $CRON_SECRET"
```
