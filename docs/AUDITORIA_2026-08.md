# Auditoría técnica de Cláriva — agosto 2026 (v2, corregida)

> Revisión del repo `dental-platform`, rama `arch/split-frontend-backend`, último commit
> `67b0332` (2026-07-31). Plataforma **en producción con dos clínicas reales**.
>
> **Esta versión corrige tres afirmaciones equivocadas de la v1.** Están listadas al final,
> en "Correcciones a la v1", con lo que verifiqué en cada caso. Todo lo que sigue lo
> comprobé leyendo el código, no infiriéndolo.

---

## Qué verifiqué y qué no

Leí el código del stack vivo (`backend/`, `shared/`, y el índice de `frontend/`), el
schema de control y el de tenant, el estado de git y toda la carpeta `docs/`.

**No pude verificar** nada que viva fuera del repo: el dashboard de Railway (qué servicios
existen, si hay cron services, qué backups están activos), la consola de Google Cloud, ni
el estado real de la base de datos. Todo lo que dependa de eso lo marco explícitamente
como *a verificar por vos*, no como hallazgo.

Tampoco pude correr los tests: `node_modules` está instalado para Windows y el binding
nativo de `rolldown` no carga en Linux. Así que no afirmo nada sobre el estado de la suite.

## Lo primero: el monolito ya no corre, pero sigue versionado

Tenés razón: el monolito salió de producción en el cutover y no hay ningún servicio
sirviéndolo. Lo que sí sigue pasando es que **su código continúa commiteado en la rama
viva**: 160 archivos en `app/`, 20 en `lib/`, 11 en `prisma/`, más `proxy.ts`,
`next.config.ts`, `components/` y el `package.json` de la raíz con Next y NextAuth.

Eso por sí solo no rompe nada —no hay `railway.json` en la raíz, así que ningún servicio
lo construye—. El problema es otro: `CLAUDE.md`, que es el archivo que toda sesión de IA
lee primero, sigue describiendo **ese** sistema como si fuera producción. Habla de base
compartida con `clinicaId`, de NextAuth, de `prisma/schema.prisma` en la raíz, de
`seed-aranceles.ts` corriendo en cada build. Nada de eso es cierto hoy.

El resultado práctico: cualquier sesión futura arranca con un mapa de un sistema que no
existe, y hay 190 archivos de código creíble esperando a que alguien los edite por error.
Es la corrección más barata y de mayor rendimiento de toda esta lista: reescribir
`CLAUDE.md` para el stack real y borrar el monolito del árbol —el historial de git lo
conserva igual si algún día hace falta auditarlo—.

`docs/SESSION_HANDOFF.md` tiene la misma deriva: quedó en 2026-06-20 con "pendiente solo
el QA", mientras el historial muestra seis semanas posteriores de trabajo sustancial
(CRM con Meta Lead Ads, agendamiento online, consentimientos, boxes, suscripciones y
pagos con Flow, permisos granulares) que no figuran en ningún documento de estado.

## A verificar hoy: si los crons están corriendo

El workflow `.github/workflows/clariva-cron.yml` existe **solo en
`arch/split-frontend-backend`**, y GitHub Actions dispara los `schedule` únicamente desde
la rama por defecto, que sigue siendo `master` (congelada en el commit `528cc54` del
2026-06-15, 291 commits atrás). Por ese camino, entonces, no corre nada.

El otro camino sí puede estar activo: `cron/railway.json` trae `cronSchedule: "0 6 * * *"`,
así que si creaste el servicio cron en Railway con `JOB=cleanup`, la limpieza de demos
corre. Pero `sync` (Google Calendar, cada 15 min) y `recordatorios` (WhatsApp) necesitan
**cada uno su propio servicio**, según documenta `docs/deploy-extras.md`.

Vale la pena mirarlo en el dashboard antes que cualquier otra cosa. Si `sync` no está,
la agenda no se está sincronizando con Google desde el cutover; si `cleanup` no está,
cada demo que se generó desde entonces dejó una base de Postgres huérfana ocupando disco.

Relacionado, y también a verificar: el handoff de junio dice que Google OAuth sigue en modo
*Testing*. En ese modo Google caduca los refresh tokens a los 7 días, así que la
integración de calendario se rompería sola cada semana aunque el cron sí corriera. Si
todavía está en Testing, conviene iniciar la verificación ya: tarda entre una y seis semanas.

## Backups: la brecha real

No hay ningún mecanismo de backup lógico en el código —lo confirmé buscando en todo
`backend/src`, `scripts/`, `cron/` y `.github/`—. Lo único que existe es lo que Railway
haga por su cuenta con el volumen.

Y eso no alcanza, por dos razones concretas:

**Railway restaura el volumen entero, no una base.** Como cada clínica tiene su base
física propia, recuperar los datos de una clínica implicaría hacer retroceder también a
la otra. En un SaaS con dos clientes distintos eso no es una opción: para arreglarle el
problema a uno le arruinás el día al otro.

**La ventana de retención es corta.** Los backups diarios de volumen de Railway se
conservan **6 días**. El escenario típico no es "se cayó el servidor" —eso se nota al
instante—, es "la clínica descubre a fin de mes que falta un plan de tratamiento que
alguien borró hace tres semanas". A los 6 días ese snapshot ya no existe.

Los caminos reales de pérdida de datos hoy son de aplicación, no de infraestructura:
un borrado desde la ficha, una importación masiva de pacientes mal armada
(`/api/pacientes/import` acepta un archivo y escribe), un bug nuevo que corrompe datos de
una clínica, o el compromiso de la cuenta de Railway —donde los backups viven en el mismo
lugar que los datos, así que no protegen contra eso—. Ninguno se resuelve con snapshots
de volumen.

Se suma un caso que va a aparecer solo: portabilidad. El día que una clínica se vaya o
pida "dame todos mis datos", hoy no hay forma de entregárselos sin escribir el script en
el momento. Y son datos de salud de pacientes chilenos: la trazabilidad de dónde están y
quién puede recuperarlos es parte de la responsabilidad frente a la clínica.

La buena noticia es que tu arquitectura hace la solución mucho más limpia de lo normal:
restaurar una clínica es `CREATE DATABASE` + `pg_restore` + cambiar un string en
`control.Clinica.dbName` + `disposeTenant()`. Cero downtime para la otra clínica, y el
rollback es cambiar el string de vuelta. Eso está desarrollado en `docs/PROMPT_BACKUPS.md`.

## Una defensa barata que conviene agregar

`dropTenantDatabase()` (`backend/src/lib/provision.ts:48`) ejecuta `DROP DATABASE` de
verdad. Hoy **ningún camino lo llama sobre una clínica productiva** —lo verifiqué: los tres
call sites son rollback de creación fallida (`clinicas-registry.service.ts:99` y
`demo.service.ts:87`, ambos borrando una base creada segundos antes) y la limpieza de
demos expiradas (`demo.service.ts:102`, filtrada por `esDemo: true`)—. No hay endpoint de
super-admin que borre una clínica.

Pero es una función sin ninguna barrera propia: depende enteramente de que quien la llame
tenga razón. Agregarle una aserción defensiva —negarse a borrar una base cuya clínica no
esté marcada `esDemo`, o que tenga pacientes— cuesta veinte líneas y cierra la puerta a
que un script futuro o una llamada manual apurada haga un desastre irreversible.

## Cosas que el código hace bien (y que no hay que "arreglar")

Lo anoto porque en la v1 me equivoqué justamente acá, y porque conviene que quede escrito
para que nadie lo rompa después:

`migrate-tenants.ts` corre `prisma db push` **sin** `--accept-data-loss`, deliberadamente,
con un comentario que explica el razonamiento: si un cambio implicara perder datos de una
clínica, el push falla y esa base se marca como fallida en vez de destruir en silencio.
Además, una migración fallida no tumba el arranque de toda la plataforma. Es la decisión
correcta y está bien argumentada.

En la misma línea: los tres `dropTenantDatabase` están donde corresponde, el aislamiento
multi-tenant es físico y no depende de que nadie olvide un `where`, la política de CORS
distingue bien entre rutas públicas y autenticadas, el rate limit solo consume cupo con
los fallos, y `crearPrestacion` es idempotente por diseño.

## Hallazgos concretos en el código

**Correlativo de cobros calculado fuera de la transacción.** En
`backend/src/services/cobros.service.ts:185` el número de comprobante sale de
`findFirst({ orderBy: { numero: 'desc' } })` más uno, y recién en la línea 194 empieza el
`$transaction` que crea el cobro. Dos cobros simultáneos en la misma clínica —recepción y
box cobrando a la vez— leen el mismo máximo. Como `numero` es `@unique`
(`prisma/tenant/schema.prisma:472`), **no se corrompe nada**: el segundo cobro falla con
error y hay que reintentarlo. Con dos puestos activos es poco frecuente pero va a pasar, y
para la recepcionista se ve como "el sistema se cayó justo cuando cobraba". El mismo patrón
está en las líneas 242 y 276. Se arregla moviendo el cálculo adentro de la transacción o
usando una secuencia de Postgres.

**No hay forma de enterarse de que algo falló.** No hay Sentry ni equivalente, ni logging
estructurado, ni request-id, ni alertas: 48 `console.*` sueltos en `backend/src` son toda
la observabilidad. El mecanismo actual de detección de errores es que la clínica llame por
teléfono. En una plataforma con clientes pagando, ese es probablemente el segundo problema
más caro después de los backups.

**El healthcheck no verifica nada.** `backend/src/app.ts:68` responde
`{ ok: true, ts: Date.now() }` sin tocar la base. Si Postgres deja de responder, Railway
sigue viendo el servicio en verde y su `restartPolicy` nunca se activa. Un `SELECT 1`
contra el control-plane convierte ese endpoint en algo útil, y le da a un UptimeRobot algo
real que vigilar.

**El caché de conexiones no tiene techo.** `backend/src/db/tenant.ts` cachea un
`PrismaClient` por `dbName` sin límite ni expiración, y cada cliente abre su propio pool.
Con dos clínicas es irrelevante. A treinta o cuarenta se agota el `max_connections` del
Postgres y la plataforma entera deja de responder. Es el techo de escalamiento más cercano
que tiene el sistema, y conviene ponerle un LRU con desconexión **antes** de acercarse, no
cuando ya esté vendiendo. Nota relacionada: `dedupePrestacionesTodasLasClinicas()` corre en
cada arranque y abre un cliente por clínica que nunca se descarta, así que alimenta el mismo
caché desde el primer segundo de vida del proceso.

**El rate limit se resetea en cada deploy.** `backend/src/lib/rate-limit.ts` guarda el
estado en memoria del proceso. La limitación está documentada para el caso de varias
réplicas, pero con una sola el efecto práctico es otro: cada redeploy —y en esta etapa hay
varios por día— borra los contadores y abre una ventana limpia para fuerza bruta.

**El dinero es `Float`.** El schema tenant tiene 34 campos `Float` y ningún `Decimal`. Para
montos enteros en CLP la mayoría de las operaciones sobreviven, pero las comisiones de
medios de pago (`monto * comision / 100`, `cobros.service.ts:180`) y los porcentajes de
liquidación de doctores generan residuos de coma flotante que reaparecen como descuadres de
uno o dos pesos en los cierres de caja. Migrar a `Decimal` es invasivo; redondear
explícitamente en cada cálculo de porcentaje es barato y resuelve el 95%.

**Deduplicación de prestaciones sin transacción.** `dedupePrestaciones`
(`catalogo.service.ts`) reasigna `tratamiento` e `itemPresupuesto` a la prestación que
sobrevive y después borra las duplicadas, en tres operaciones sueltas. Es idempotente y
está bien pensada, pero si el proceso muere entre la reasignación y el borrado —y corre en
cada arranque, incluso durante un deploy— queda a medio camino. Envolverla en
`$transaction` cierra el tema.

## Higiene del repositorio

Hay 41 archivos modificados sin commitear con exactamente 14.510 inserciones y 14.510
borrados: es ruido de fin de línea CRLF/LF, no cambios reales, y no hay `.gitattributes`
en el repo. El costo no es el ruido sino que **esconde cambios verdaderos**: con el
`git status` permanentemente sucio, un archivo realmente modificado pasa desapercibido.
Un `.gitattributes` con `* text=auto eol=lf` más `git add --renormalize .` lo cierra.

## Prioridades sugeridas

| # | Qué | Por qué ahora | Esfuerzo |
|---|-----|---------------|----------|
| 1 | Verificar en Railway qué cron services existen | `sync` de Google podría llevar 6 semanas sin correr | 30 min |
| 2 | Backups lógicos por clínica + restore probado | Ventana de Railway = 6 días, y restaura a las dos clínicas juntas | 2–3 días |
| 3 | Sentry + `/health` con `SELECT 1` + UptimeRobot | Hoy los errores los detectan las clínicas | medio día |
| 4 | Reescribir `CLAUDE.md` y borrar el monolito del árbol | Cada sesión de IA arranca con el mapa equivocado | medio día |
| 5 | Aserción defensiva en `dropTenantDatabase` | Cierra para siempre la puerta a un borrado irreversible | 1 hora |
| 6 | `.gitattributes` + renormalizar + commitear | El `git status` sucio esconde cambios reales | 30 min |
| 7 | Verificar estado de Google OAuth (Testing) | Los tokens caducarían cada 7 días; la revisión tarda semanas | 1 h + espera |
| 8 | Correlativo de cobros dentro de la transacción | Cobros que fallan con dos puestos cobrando a la vez | 2 horas |
| 9 | LRU en el caché de clientes por tenant | Techo de escalamiento a ~30 clínicas | medio día |
| 10 | Redondeo explícito en comisiones y liquidaciones | Descuadres de pesos en cierres de caja | medio día |
| 11 | 2FA TOTP para super-admin | Es la cuenta que ve todas las clínicas | 1 día |
| 12 | `dedupePrestaciones` dentro de `$transaction` | Estado a medias si el proceso muere durante un deploy | 1 hora |
| 13 | Actualizar handoff, architecture.md y parity-matrix | Seis semanas de trabajo sin registrar | medio día |
| 14 | Merge `arch → master` y limpiar Railway | Cierra el cutover y activa los crons de GitHub | medio día |

Del 1 al 6 es el bloque que cambia el perfil de riesgo. El resto puede repartirse sin
sobresaltos. Lo que no conviene es seguir sumando funcionalidades sobre una base sin
backups ni observabilidad: cada clínica nueva multiplica el costo del primer incidente.

---

## Correcciones a la v1

Tres cosas que afirmé en la primera versión y que estaban mal. Las verifiqué en el código
después de que me pediste revisar mejor:

**1. "Un clic en el super-admin destruye una clínica productiva." Falso.** No existe
ningún endpoint de super-admin que borre una clínica. Los tres llamados a
`dropTenantDatabase` son rollback de creación fallida (dos) y limpieza de demos filtrada
por `esDemo: true` (uno). Verificado con `grep -rn dropTenantDatabase backend/src` y
leyendo cada call site completo.

**2. "`migrate:tenants` corre `db push` destructivo sobre datos productivos." Falso, y al
revés.** El script omite `--accept-data-loss` a propósito y documenta el razonamiento en un
comentario de ocho líneas: si el cambio implicara pérdida de datos, falla esa base en vez
de destruir. Es de las mejores decisiones del código y yo la había marcado como riesgo.

**3. "`dedupePrestaciones` en el arranque es peligroso." Exagerado.** Es idempotente, está
envuelta en try/catch por clínica y no tumba el arranque. Queda una observación menor real
—no usa transacción y filtra clientes al caché— pero no es lo que describí.

El argumento de fondo de los backups no dependía de nada de esto y sigue en pie; lo que
cambió es cuál es el escenario de pérdida que hay que temer. No es un borrado catastrófico
desde el panel: es el error de aplicación descubierto tres semanas después, cuando el
snapshot de Railway ya se venció.

---

Fuentes sobre el comportamiento de backups de Railway:
[Back Up and Restore Postgres — Railway Guides](https://docs.railway.com/guides/postgres-backups-restores) ·
[Point-in-Time Recovery — Railway Docs](https://docs.railway.com/volumes/point-in-time-recovery)
