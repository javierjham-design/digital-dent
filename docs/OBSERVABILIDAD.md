# Observabilidad de Cláriva

> Cómo nos enteramos de que algo falló **sin** depender de que una recepcionista
> llame por teléfono. Tres piezas: healthcheck real + monitor externo, Sentry
> (errores) y logging estructurado con request-id.

Implementado el 2026-08-03 (rama `feat/observabilidad`). Ver también
`docs/AI_CHANGELOG.md`.

---

## 1. Resumen de piezas

| Pieza | Qué detecta | Dónde |
|---|---|---|
| **`/health` real** | Backend arriba **y** Postgres respondiendo | `api.clariva.cl/health` |
| **UptimeRobot** | Que `/health` deje de responder 200 | servicio externo → email/WhatsApp |
| **Sentry backend** | Errores 5xx y excepciones no manejadas | proyecto `clariva-backend` |
| **Sentry frontend/web** | Errores JS no manejados en el navegador | proyectos `clariva-frontend` / `clariva-web` |
| **Logs con request-id** | Rastro de cada request (id + clínica) | logs de Railway (backend) |

**Todo es opcional y degradable:** sin `SENTRY_DSN` / `VITE_SENTRY_DSN`, Sentry
queda apagado y la app funciona igual (solo logs). El `/health` y los logs
funcionan siempre.

---

## 2. Healthcheck real (`/health`)

Antes `/health` respondía `{ ok: true }` sin tocar la base: si Postgres se caía,
Railway lo seguía viendo verde y su `restartPolicy` nunca se activaba.

Ahora hace un `SELECT 1` contra el **control-plane** con timeout de 2 s:

- **200** `{ ok: true, service, ts }` → backend y base OK.
- **503** `{ ok: false, service, error: "db-unreachable", ts }` → la base no
  responde. Railway (healthcheck) y el monitor externo se enteran.

Railway ya apunta su healthcheck a `/health` (`backend/railway.json`,
`healthcheckPath: "/health"`, `healthcheckTimeout: 300`). No cambiar eso: los 300 s
son la ventana que Railway espera durante un deploy para que el servicio quede sano.

---

## 3. Monitor externo — UptimeRobot

Railway reinicia el servicio si `/health` falla, pero **no avisa**. Para eso va un
monitor externo que pinga `/health` y alerta si deja de responder 200.

**Configurar UptimeRobot** (plan gratis alcanza: 50 monitores, chequeo cada 5 min):

1. Crear cuenta en <https://uptimerobot.com> con un correo del equipo.
2. **Add New Monitor**:
   - *Monitor Type*: **HTTP(s)**
   - *Friendly Name*: `Cláriva API`
   - *URL*: `https://api.clariva.cl/health`
   - *Monitoring Interval*: 5 min (gratis) o 1 min (pago).
   - *Advanced → Alert if*: el monitor considera "down" cualquier status ≠ 2xx,
     así que un **503** (base caída) dispara alerta. No hace falta regex.
3. **Alert Contacts**: agregar el email del equipo. Para WhatsApp/Telegram/Slack,
   UptimeRobot los soporta como *integrations* (o webhook a un bot propio).
4. Opcional: un segundo monitor a `https://clariva.cl` (web) y a
   `https://app.clariva.cl` (frontend) para detectar caídas de esos servicios.

**A quién le llega:** definir en *Alert Contacts*. Recomendado: email del dueño +
un canal instantáneo (WhatsApp/Telegram) para no depender de que alguien mire el mail.

---

## 4. Sentry

### 4.1 Crear los proyectos

En <https://sentry.io> (una organización para Cláriva), crear **tres proyectos**:

| Proyecto | Plataforma | Variable con el DSN |
|---|---|---|
| `clariva-backend` | Node.js | `SENTRY_DSN` (backend) |
| `clariva-frontend` | React | `VITE_SENTRY_DSN` (frontend) |
| `clariva-web` | React | `VITE_SENTRY_DSN` (web) |

El **DSN** de cada proyecto está en *Settings → Projects → \<proyecto\> → Client
Keys (DSN)*.

### 4.2 Cargar las variables en Railway

En el proyecto de Railway (`amused-recreation`), servicio por servicio:

- **backend** → Variables → `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`
  (opcional `LOG_LEVEL=info`). Se leen en runtime.
- **frontend** → `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT=production`.
- **web** → `VITE_SENTRY_DSN`, `VITE_SENTRY_ENVIRONMENT=production`.

> ⚠️ **Frontend y web son build-time:** Vite inyecta las `VITE_*` **al construir**.
> Después de cargarlas hay que **redeployar** (build nuevo) para que tomen efecto.
> El backend las toma con reiniciar.

### 4.3 Qué se reporta y qué NO

**Backend** (`backend/src/lib/observability.ts` + `middlewares/error.ts`):

- Se reportan **solo los 5xx** inesperados y las **excepciones no manejadas**
  (`uncaughtException` / `unhandledRejection`, ver `backend/src/index.ts`).
- Los errores esperados de dominio (`AppError`: 400/401/403/404) y de validación
  (`ZodError` → 400) **no** generan eventos: son parte del flujo normal, no fallas.
- Cada evento se etiqueta con: `clinica` (slug), `user_id`, `request_id` y `route`.

**Privacidad — NUNCA se envían datos de pacientes** (nombres, RUT, diagnósticos,
montos):

- Backend: capturamos el error con tags de routing, sin adjuntar el cuerpo de la
  request. Además `beforeSend` limpia `request.data`, cookies, query y headers de
  auth por si acaso. `sendDefaultPii: false`.
- Frontend/web: **sin Session Replay** (capturaría el DOM con datos de pacientes),
  sin cuerpos de request y **sin breadcrumbs de consola** (`beforeBreadcrumb` los
  descarta). `sendDefaultPii: false`.

Si algún día se agrega más contexto a Sentry, respetar esta regla: solo IDs y
metadatos de routing, jamás contenido clínico.

### 4.4 Cómo leer un error en Sentry → llegar a la clínica afectada

Cuando entra un evento en `clariva-backend`:

1. Abrir el *issue* → pestaña **Tags**.
2. **`clinica`** = el *slug* de la clínica (ej. `digital-dent`). Esa es la base
   `clariva_t_digital-dent` y el subdominio `digital-dent.clariva.cl`.
3. **`user_id`** = id del usuario (staff) que hizo la request. Para saber quién es,
   buscarlo en la base de esa clínica (`User`), no viene el nombre en el evento.
4. **`request_id`** = correlaciona el evento con los **logs del backend** en Railway.
   Buscar ese id en los logs (`requestId`) para ver la secuencia completa de la
   request. El mismo id se devuelve al cliente en el header `X-Request-Id` y en el
   cuerpo del 500 (`{ "error": "...", "requestId": "..." }`), así que si un usuario
   reporta un error y te pasa ese id, lo pegás en Sentry/Railway y caés justo.
5. **`route`** = `MÉTODO /ruta` donde ocurrió.

### 4.5 Alertas de Sentry

Por defecto Sentry manda email en cada *issue* nuevo. Recomendado:

- *Settings → Alerts*: una regla "cuando aparece un issue nuevo" → email del equipo,
  y opcionalmente Slack/WhatsApp vía integración.
- Silenciar (o bajar prioridad) issues conocidos que no son accionables.

---

## 5. Logging estructurado con request-id

`backend/src/lib/logger.ts` + `middlewares/request-context.ts`:

- Cada request recibe un **request-id** (heredado del header `X-Request-Id` si viene,
  o generado). Se propaga por `AsyncLocalStorage` (`lib/request-context.ts`), así
  **todos** los logs de esa request lo incluyen sin pasar `req` por todas las capas.
- Cada log lleva además el **`clinica`** (slug) y el **`userId`** cuando la request
  está autenticada.
- **Producción:** JSON de una línea (parseable en Railway). **Dev:** texto legible.
- Nivel configurable con `LOG_LEVEL` (`debug|info|warn|error`, por defecto `info`).

Uso en el código (reemplazó a los `console.*` sueltos de services/lib/middlewares):

```ts
import { log, serializeError } from '@/lib/logger'
log.info('lead procesado', { leadId })
log.error('algo falló', { err: serializeError(e) })
```

Los `console.*` que quedan a propósito son los de `backend/src/scripts/*` (son
herramientas de línea de comandos, su salida ES el output esperado).

---

## 6. Prueba rápida post-configuración

1. **Healthcheck:** `curl -i https://api.clariva.cl/health` → `200` con `ok:true`.
   (Un `503` significa que el backend no alcanza Postgres.)
2. **UptimeRobot:** el monitor debe figurar *Up* y verde.
3. **Sentry backend:** forzar un error de prueba en un endpoint de staging, o esperar
   el primer 5xx real, y verificar que aparece el issue con los tags `clinica` /
   `request_id`.
4. **Request-id:** `curl -i https://api.clariva.cl/health` y confirmar el header
   `X-Request-Id` en la respuesta.

---

## 7. Pendientes / mejoras futuras

- Sentry *Session Replay* queda **deshabilitado a propósito** (privacidad). Si algún
  día se quiere, habría que enmascarar todo el texto y descartar inputs — evaluar con
  cuidado antes.
- Métricas/uptime histórico y dashboards (Grafana/Better Stack) si el volumen crece.
- Alertar específicamente cuando `/health` devuelve 503 vs. timeout (hoy ambos =
  "down" en UptimeRobot, que alcanza).
