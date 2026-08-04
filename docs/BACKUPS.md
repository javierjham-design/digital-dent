# Backups y restauración de Cláriva

> Cómo recuperar los datos de **una** clínica sin hacer retroceder a las demás.
> Escrito para ejecutarse a las 3 AM sin leer código. Implementado 2026-08-03.

---

## 1. Por qué tres capas

Cada clínica tiene su **base física propia** (`clariva_t_<slug>`). Eso hace que el backup
del servidor entero sea insuficiente:

| Capa | Qué es | Para qué sirve | Para qué NO |
|---|---|---|---|
| **1. Volumen Railway** | Snapshot diario del disco + PITR | Caída total del servidor Postgres | Recuperar UNA clínica (arrastra a todas); solo 6 días de retención |
| **2. Dump lógico por base** | `pg_dump` por clínica, cifrado, en R2 (fuera de Railway) | Copia por clínica, larga retención, fuera de la cuenta de Railway | Restaurar solo (es material para la capa 3) |
| **3. Restauración quirúrgica** | `npm run restore --slug X` | Devolver UNA clínica a un punto anterior sin tocar a las demás | — |

El modo de pérdida real no es "se cayó el servidor" (se nota al instante), es "la clínica
descubre a fin de mes que falta un plan de tratamiento borrado hace tres semanas". Para eso
sirven la capa 2 (retención larga) y la capa 3 (restaurar solo esa clínica).

```
   ┌─────────────────────────── Railway (una cuenta) ───────────────────────────┐
   │  Postgres: clariva_control + clariva_t_<slugA> + clariva_t_<slugB> + …      │
   │     └── CAPA 1: snapshot de volumen diario + PITR (pgBackRest ~4 semanas)   │
   └───────────────┬────────────────────────────────────────────────────────────┘
                   │  pg_dump -Fc por base  →  AES-256-GCM (stream)  →  multipart
                   ▼
   ┌──────────── Cloudflare R2 (FUERA de Railway) ──────────── CAPA 2 ───────────┐
   │  clariva/<YYYY>/<MM>/<DD>/<dbName>__<ISO>.dump.enc                           │
   │  clariva/<YYYY>/<MM>/<DD>/manifest__<ISO>.json   (sha256 + censo de filas)   │
   │  clariva/pre-drop/…                              (copias antes de borrar)    │
   │  object-lock por prefijo (inmutabilidad) · poda GFS con creds separadas      │
   └────────────────────────────────────────────────────────────────────────────┘
                   │  descarga + descifra + pg_restore a base NUEVA + verifica censo
                   ▼
   CAPA 3:  npm run restore -- --slug <clinica> --at <ISO|latest> [--switch]
```

---

## 2. Componentes (qué corre y dónde)

Todo vive en el **backend** (misma imagen, que ahora incluye `postgresql-client`). En
Railway se configuran como **servicios cron separados** (no dentro del API, para no competir
con las requests de las clínicas):

| Servicio Railway | Comando | Schedule sugerido (UTC) | Credenciales |
|---|---|---|---|
| `backup` | `npm run backup` | `0 7 * * *` (03–04 Chile) | `BACKUP_S3_*` (escritura, **sin delete**) |
| `backup-prune` | `npm run backup:prune -- --apply` | `30 8 * * 0` (semanal) | `BACKUP_S3_PRUNE_*` (con delete) |
| `backup-drill` | `npm run backup:drill` | `0 8 * * 1` (semanal) | `BACKUP_S3_*` (lectura) |

Cada uno: en Railway, servicio nuevo apuntando al **mismo repo/Dockerfile del backend**,
con `Custom Start Command` = el comando de arriba y `Cron Schedule` seteado. Reusan el
patrón de `cron/` (servicio dedicado), pero ejecutan el script del backend, no un HTTP call.

Además, el **API** expone `POST /api/v1/admin/backups/run` (auth `x-cron-secret` o
super-admin) para disparar un backup **a mano antes de una operación riesgosa**:

```bash
curl -X POST https://api.clariva.cl/api/v1/admin/backups/run -H "x-cron-secret: $CRON_SECRET"
```

El **restore** (capa 3) NO es un cron: se corre a mano cuando hace falta, con
`railway run --service <backend> npm run restore -- …` o desde una consola con las env.

---

## 3. Variables de entorno (cargar en Railway)

Ver `backend/.env.example` para el listado con comentarios. Resumen:

| Variable | Dónde | Qué |
|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | backup, drill, restore, API | Clave AES-256-GCM, 32 bytes base64. **Si se pierde, los backups son irrecuperables.** |
| `BACKUP_S3_ENDPOINT` / `_REGION` / `_BUCKET` / `_PREFIX` | todos | Destino R2/S3 (prefix por defecto `clariva`) |
| `BACKUP_S3_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | backup, drill, restore, API | Credenciales **escritura+lectura, SIN delete** |
| `BACKUP_S3_PRUNE_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | **solo servicio de poda** | Credenciales **con delete**. Nunca en el env del backend. |
| `BACKUP_RETAIN_DAILY` / `_WEEKLY` / `_MONTHLY` | poda | GFS (14 / 8 / 12) |
| `BACKUP_PRUNE_MIN_KEEP` | poda | Piso: no borra si dejaría menos de esto (3) |
| `BACKUP_INCLUDE_DEMOS` | backup | Incluir demos (por defecto no) |
| `BACKUP_ALERT_EMAILS` | backup, drill | Destinatarios de alerta (coma). Vacío → PlatformAdmin |
| `BACKUP_MAX_AGE_HOURS` | backup | Dead-man's switch (36) |

**Generar la clave** (una sola vez, guardar en gestor de secretos aparte del bucket):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 4. Detalles de infraestructura

- **Versión de Postgres.** El `pg_dump` del cliente debe ser de major **≥** al del servidor.
  Verificá con:
  ```sql
  SELECT version();
  ```
  El `backend/Dockerfile` instala `postgresql-client-18` (PGDG). **Verificado 2026-08-04:
  el server de Railway es Postgres 18.3**, por eso el cliente 18. Si Railway sube el server
  a 19+, cambiá el major en el Dockerfile, o `pg_dump` falla con "server version mismatch".
- **Red interna.** Conectarse por `postgres.railway.internal:5432` (las URLs internas ya lo
  usan), no por el proxy público: más rápido y sin ancho de banda facturado.
- **Permisos.** `TENANT_DB_SERVER_URL` ya tiene `CREATE DATABASE` (lo usa la provisión), así
  que el restore no necesita permisos nuevos.
- **Cloudflare R2.** Sin costo de egreso; ~USD 0,015/GB-mes. Con el volumen actual, centavos.

### Object lock (inmutabilidad) — configurar en el bucket

Activar **bucket lock / retención por prefijo** en R2, con duraciones **menores** que la
retención GFS (si el lock durara igual o más, la poda no podría borrar y el bucket crecería
para siempre):

| Prefijo | Object lock | Retención GFS (poda) |
|---|---|---|
| diarios (banda reciente) | **7 días** | 14 días |
| semanales | **30 días** | 56 días (8 semanas) |
| mensuales | **180 días** | 365 días (12 meses) |

Así **nada** puede borrar el histórico dentro de su ventana de lock (ni un atacante con las
credenciales de poda), pero la poda legítima sí puede eliminar lo que ya salió de esa
ventana. **No usar retención indefinida** (imposibilita podar). Un bucket con reglas de lock
**no se puede vaciar** mientras las tenga: es justamente la protección buscada. No cambiar
estas duraciones sin entender que romper la relación lock < retención rompe la poda.

---

## 5. RUNBOOK — "una clínica perdió datos"

Ejemplo: la clínica `digital-dent` reporta que le faltan planes/citas borrados hace días.

1. **NO toques producción todavía.** Primero mirá qué habría en el backup (dry-run, no cambia
   nada):
   ```bash
   railway run --service backend npm run restore -- --slug digital-dent --at latest
   ```
   Para un punto anterior específico (restaura el estado a esa fecha):
   ```bash
   railway run --service backend npm run restore -- --slug digital-dent --at 2026-07-28T00:00:00Z
   ```
   Esto descarga el dump, verifica su sha256, lo restaura en una base **temporal**, chequea el
   censo contra el manifiesto e imprime un **diff**: pacientes/citas/cobros y monto total
   **hoy vs. lo que se restauraría**. Si el censo no calza, **aborta solo** (no cambia nada).

2. **Leé el diff.** ¿El backup tiene los datos que faltan y no perdés nada importante que se
   haya creado después? Si dudás, `--keep-temp` deja la base temporal para inspeccionarla:
   ```bash
   railway run --service backend npm run restore -- --slug digital-dent --at latest --keep-temp
   # inspeccioná la base clariva_t_digital_dent_r<ts> con psql, después borrala manual
   ```

3. **Hacé el corte** cuando estés seguro:
   ```bash
   railway run --service backend npm run restore -- --slug digital-dent --at latest --switch
   ```
   Esto renombra la base viva a `…_prev<ts>` (**se conserva**), apunta la clínica a la base
   restaurada e invalida el cliente cacheado. **Las demás clínicas no se tocan.**

4. **Verificá** en la app de la clínica (`digital-dent.clariva.cl`) que los datos volvieron.

5. **Rollback** si algo salió mal (la base vieja sigue ahí):
   ```sql
   -- en clariva_control:
   UPDATE "Clinica" SET "dbName" = 'clariva_t_digital_dent_prev<ts>' WHERE slug = 'digital-dent';
   ```
   y reiniciar el backend (o esperar a que expire el cache de tenant, 30 s).

6. **Limpieza** (opcional, más tarde, irreversible — hace un pre-drop antes de borrar):
   ```bash
   railway run --service backend npm run restore -- --drop-pre-restore --db clariva_t_digital_dent_prev<ts> --apply
   ```

---

## 6. RUNBOOK — "se cayó el Postgres entero"

Esto es la **capa 1** (Railway), no la 2/3.

1. En Railway → servicio Postgres → **Backups**: restaurar el snapshot de volumen más
   reciente, o usar **Point-in-Time Recovery** para volver a un minuto puntual (ventana
   ~4 semanas si PITR/pgBackRest está activo).
2. Verificar que el backend levante y `https://api.clariva.cl/health` responda **200**
   (si responde 503, Postgres todavía no está).
3. Confirmar que las dos clínicas entran (`<slug>.clariva.cl`).
4. Si el snapshot es viejo y faltan datos recientes de UNA clínica, completá con la capa 3
   (restore quirúrgico de esa clínica desde R2).

> **Capa 1 en Railway — CONFIGURADA (2026-08-04):** servicio Postgres → pestaña **Backups**.
> - **Volume backups** (schedules activados): **Daily** (retención 6 días) · **Weekly**
>   (1 mes) · **Monthly** (3 meses). Más un snapshot on-demand inicial. No cortan servicio.
> - **Point-in-Time Recovery**: **habilitado**. Archivado continuo de WAL → restaurar a
>   cualquier punto reciente. Habilitarlo regeneró las credenciales de Postgres y reinició
>   el servicio **una sola vez** (~30 s de corte, verificado 503→200 + login OK); después
>   corre en segundo plano sin cortes. Nota: tras habilitar, Railway tarda hasta ~1 h en
>   completar el primer base backup y dejar la cobertura "en verde" (es normal).
> Es la red contra la caída total del servidor; no sirve para recuperar una sola clínica
> (para eso están las capas 2 y 3).

---

## 7. Retención y poda

- Política **GFS por bandas de edad** (implementada en `retention.ts`, no se confía solo en
  el lifecycle del bucket): dentro de `retainDaily` días se conserva **todo**; hasta
  `retainWeekly` semanas, el más nuevo de cada semana; hasta `retainMonthly` meses, el más
  nuevo de cada mes; más viejo se borra.
- La poda corre en un **servicio separado con credenciales propias** (las del backend NO
  pueden borrar). Es **dry-run por defecto**; borra solo con `--apply`. Se **niega** si no
  encuentra un manifiesto válido reciente (señal de backups rotos) o si dejaría una base con
  menos de `BACKUP_PRUNE_MIN_KEEP` backups.

---

## 8. Ensayos de restauración (dead-man's switch de la confianza)

Un backup que nunca se restauró no es un backup. `npm run backup:drill` (semanal) restaura
la base de control y la clínica más chica a bases efímeras, valida el censo y las borra;
**si falla, alerta por email**. Registrar acá cada ensayo (o el resultado del cron):

| Fecha | Quién / cómo | Resultado | Notas |
|---|---|---|---|
| _____ | drill automático | ______ | ______ |

Alertas: además del drill, el job diario avisa por email si una corrida termina **PARCIAL**
o **ERROR**, y el **dead-man's switch** avisa si pasaron más de `BACKUP_MAX_AGE_HOURS` sin una
corrida OK (el modo de falla real es que los backups dejen de correr y nadie se entere). Si
el servicio cron ENTERO se cae, el fallback es un monitor externo (UptimeRobot) — ver
`docs/OBSERVABILIDAD.md`.

---

## 9. Custodia de la clave

`BACKUP_ENCRYPTION_KEY` cifra **todos** los dumps. Si se pierde, los backups son ilegibles;
si se filtra, alguien con acceso al bucket puede leerlos. Guardarla en un gestor de secretos
(no solo en Railway, para poder descifrar aunque se pierda la cuenta), separada de las
credenciales del bucket. Rotarla implica que los dumps viejos siguen atados a la clave vieja:
conservar las claves históricas para poder restaurar backups anteriores.

---

## 10. Cambios de schema y frescura de backups (`migrate-tenants`)

Aplicar un cambio de schema (`prisma/tenant/schema.prisma`) a las clínicas existentes se
hace **a mano** y con la red de un backup fresco:

```bash
npm run tenant:initsql                      # DDL para clínicas NUEVAS
npm run migrate:tenants -- --strict         # sincroniza las EXISTENTES; ABORTA si el
                                            # último backup OK tiene >24 h
```

Si aborta por backups atrasados: corré `npm run backup` primero (o
`POST /admin/backups/run`), y reintentá. Para saltear el chequeo a conciencia:
`SKIP_BACKUP_FRESHNESS_CHECK=1`.

**Por qué solo `--strict` aborta:** `migrate:tenants` también corre en el `prestart` del
backend, es decir en **cada deploy y cada reinicio del contenedor**. Si el chequeo abortara
ahí, un backup atrasado >24 h impediría que el backend arranque, y con `restartPolicy
ON_FAILURE` eso dejaría a las dos clínicas **sin plataforma por un problema de backups**.
Por eso el prestart **nunca aborta**: solo avisa fuerte (log `error`) y manda una **alerta
por email**, pero deja arrancar el server. El hard-abort vive únicamente detrás de
`--strict` (invocación manual y deliberada). No cambiar esto sin entender el trade-off.

## 11. Entrega de datos a una clínica que se va

`npm run restore -- --slug <clinica> --at latest --keep-temp` deja una base restaurada
independiente; desde ahí se puede `pg_dump` a un `.sql`/`.csv` para entregar. (Los datos son
de salud de pacientes chilenos: entregar por un canal seguro y dejar registro.)
