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

Schedules (Settings → Cron Schedule de cada servicio — es **por servicio**, no en
railway.json):
| JOB | Qué hace | Schedule |
|-----|----------|----------|
| `cleanup` | borra clínicas demo expiradas | `0 6 * * *` (diario 06:00) |
| `recordatorios` | recordatorios de cita por WhatsApp | `*/20 * * * *` (cada 20 min) |
| `sync` | sincroniza Google Calendar | `*/15 * * * *` (cada 15 min) |

`cron/railway.json` trae `restartPolicyType: NEVER` (un job corre y termina) pero **no**
fija un `cronSchedule`: como `run.mjs` despacha varios jobs con horarios distintos, el
schedule se define en cada servicio (Settings → Cron Schedule). Si lo pusiera en
railway.json, ese valor pisaría el del dashboard en cada deploy.

Probar un job manualmente:
```
curl -X POST https://api.clariva.cl/api/v1/demo/cleanup -H "x-cron-secret: $CRON_SECRET"
```

## C. Los crons viven en Railway, NO en GitHub Actions (no revivir el workflow)

**Los cinco servicios cron están en Railway** (proyecto `amused-recreation`, env
`production`), todos con `restartPolicyType: NEVER`, Root Directory = `cron/` (salvo los de
backup, que corren scripts del backend), branch `arch/split-frontend-backend` y
`CRON_SECRET=${{BACKEND.CRON_SECRET}}` (⚠️ **`BACKEND` en MAYÚSCULAS**, la referencia es
case-sensitive):

| Servicio Railway | Qué hace | Schedule (UTC) |
|------------------|----------|----------------|
| `cron-google-sync` | `JOB=sync` → `POST /google/sync` | `*/15 * * * *` |
| `cron-demo-cleanup` | `JOB=cleanup` → `POST /demo/cleanup` | `0 6 * * *` |
| `backup` | `npm run backup` (dump lógico por clínica) | `0 7 * * *` |
| `backup-drill` | `npm run backup:drill` (ensayo de restore) | `0 8 * * 1` |
| `backup-prune` | `npm run backup:prune -- --apply` | `30 8 * * 0` |
| `cron-recordatorios` ⏳ **pendiente de crear** | `JOB=recordatorios` → `POST /whatsapp/recordatorios` (recordatorios de cita por TuBot) | `*/20 * * * *` |

**`cron-recordatorios` — config exacta (crear cuando se habilite WhatsApp en alguna clínica).**
El endpoint y el script (`cron/run.mjs`, JOB `recordatorios`) ya existen; con 0 clínicas
habilitadas es un **no-op** (`{enviados:0}`), así que crearlo antes no hace daño. Dashboard →
**New Service** → *Deploy from GitHub repo* (`javierjham-design/digital-dent`):
- **Branch**: `arch/split-frontend-backend`
- **Root Directory**: `cron`
- **Cron Schedule**: `*/20 * * * *`
- **Restart Policy**: `NEVER`
- **Variables**:
  - `JOB=recordatorios`
  - `API_URL=https://api.clariva.cl`
  - `CRON_SECRET=${{BACKEND.CRON_SECRET}}`  (⚠️ `BACKEND` en MAYÚSCULAS)

⚠️ **No se puede crear por `railway add`** (el CLI no fija `rootDir` ni `cronSchedule`): es
tarea de dashboard, como los otros crons. **No revivir el workflow de GitHub Actions.**

**Relacionado — `TUBOT_BASE_URL` (BACKEND).** Base de la API de TuBot para enviar plantillas.
Hoy **sin setear** (el código cae a `http://localhost:4020`, inofensivo porque WhatsApp está
apagado). Setearla en el servicio `BACKEND` con la URL real de TuBot **al conectar la primera
clínica**. Ver `docs/TUBOT_WHATSAPP.md`.

**Por qué NO usamos GitHub Actions para esto.** Existió `.github/workflows/clariva-cron.yml`
que hacía los mismos `POST` de `sync` y `cleanup` por schedule. Se **retiró (2026-08-05)** y
NO debe revivirse:

- Las Actions programadas **solo corren en la rama default** del repo. El workflow estuvo
  dormido mientras `master` era el monolito; al mergear `arch → master` (2026-08-05) se
  activó de golpe y quedó **duplicando** el `sync` que ya hacía `cron-google-sync`.
- **Railway es la única fuente de verdad de los crons**: ahí se ven `nextCronRunAt`, los logs
  de cada corrida y conviven con los tres de backup. Partir los crons entre dos plataformas
  hace más difícil saber si algo corrió.
- El mínimo de Railway entre ejecuciones de cron es **5 minutos** (por eso no hay schedules
  sub-5m). Para forzar una corrida de prueba: fijar temporalmente un horario puntual cercano
  (`MM HH * * *`) y restaurar después; o `POST` manual al endpoint con `x-cron-secret`.

> Nota histórica: el `sync` siempre lo cubrió `cron-google-sync`. El `cleanup` **no tenía**
> servicio en Railway (solo lo cubría el workflow, que además no corría por el tema de la rama
> default), así que al retirar el workflow se creó `cron-demo-cleanup` para no quedarse sin
> limpieza de demos. Ver `docs/integraciones-google-whatsapp.md`.
