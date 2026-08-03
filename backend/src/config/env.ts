import 'dotenv/config'

// Centraliza la lectura de variables de entorno. Falla rápido si falta algo
// crítico en producción.
function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`)
  }
  return v
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  // El backend comparte la misma base de datos que el monolito durante la
  // migración (single source of truth). DATABASE_URL ya existe en Railway.
  databaseUrl: required('DATABASE_URL', 'postgresql://localhost:5432/clariva'),

  // ── Database-per-tenant ──────────────────────────────────────────────────
  // Control-plane: registro de clínicas, planes, leads, facturación, admins.
  controlDatabaseUrl: process.env.CONTROL_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/clariva_control',
  // Servidor Postgres donde viven las bases de los tenants. La URL de cada
  // clínica se construye cambiando el nombre de la base por su `dbName`.
  // Debe tener permisos para CREATE DATABASE (provisión de clínicas).
  tenantDbServerUrl: process.env.TENANT_DB_SERVER_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/postgres',
  // Fuente de la migración de datos F7: la base COMPARTIDA del monolito (con
  // clinicaId). Solo la usa el script `npm run migrate:data`.
  legacyDatabaseUrl: process.env.LEGACY_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://localhost:5432/clariva',
  // Secreto para firmar los JWT que emite ESTE backend.
  jwtSecret: required('JWT_SECRET', process.env.NEXTAUTH_SECRET ?? 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  // Orígenes permitidos para CORS (el frontend Vite + otros explícitos).
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Dominio de la plataforma (p.ej. "clariva.cl"). Si está definido, se permiten
  // por CORS el apex y CUALQUIER subdominio (cada clínica vive en <slug>.dominio).
  platformDomain: (process.env.PLATFORM_DOMAIN ?? '').toLowerCase().trim(),
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  cronSecret: process.env.CRON_SECRET ?? '',

  // ── Meta Lead Ads (webhook nativo, compartido por toda la plataforma) ──────
  // La App de Meta es una sola; cada clínica autoriza su página y guarda su
  // token de página en su Configuracion. El verify token lo definimos nosotros;
  // el app secret valida la firma HMAC del webhook. Sin secret → firma no válida.
  metaAppId: process.env.META_APP_ID ?? '',
  metaAppSecret: process.env.META_APP_SECRET ?? '',
  metaWebhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN ?? '',
  // Versión ÚNICA de la Graph API para TODAS las llamadas a Meta (CAPI web,
  // emisor de etapas de CRM, webhook de Lead Ads). Configurable por env.
  metaGraphVersion: process.env.META_GRAPH_VERSION ?? 'v25.0',

  // ── Backups lógicos por base (capa 2, ver docs/BACKUPS.md) ─────────────────
  // La clave de cifrado se lee y valida aparte (loadBackupKey), no acá. Secretos
  // de S3 se leen donde se usan. Acá va la config no sensible + destino.
  backup: {
    includeDemos: process.env.BACKUP_INCLUDE_DEMOS === '1' || process.env.BACKUP_INCLUDE_DEMOS === 'true',
    // Destino S3-compatible (Cloudflare R2 por defecto recomendado).
    s3Endpoint: process.env.BACKUP_S3_ENDPOINT ?? '',
    s3Region: process.env.BACKUP_S3_REGION ?? 'auto',
    s3Bucket: process.env.BACKUP_S3_BUCKET ?? '',
    s3Prefix: (process.env.BACKUP_S3_PREFIX ?? 'clariva').replace(/^\/+|\/+$/g, ''),
    // Retención GFS (poda explícita en el script backup:prune, con creds propias).
    retainDaily: Number(process.env.BACKUP_RETAIN_DAILY ?? 14),
    retainWeekly: Number(process.env.BACKUP_RETAIN_WEEKLY ?? 8),
    retainMonthly: Number(process.env.BACKUP_RETAIN_MONTHLY ?? 12),
    // Piso de seguridad: la poda se niega si dejaría menos de esto por base.
    pruneMinKeep: Number(process.env.BACKUP_PRUNE_MIN_KEEP ?? 3),
    // Dead-man's switch: alerta si pasaron más de estas horas sin una corrida OK.
    maxAgeHours: Number(process.env.BACKUP_MAX_AGE_HOURS ?? 36),
    // Destinatarios de alertas (coma). Fallback: los PlatformAdmin activos.
    alertEmails: (process.env.BACKUP_ALERT_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    // Binarios del cliente Postgres (por si hay que apuntar a una ruta concreta).
    pgDumpPath: process.env.PG_DUMP_PATH ?? 'pg_dump',
    pgRestorePath: process.env.PG_RESTORE_PATH ?? 'pg_restore',
  },
}

export const isProd = env.nodeEnv === 'production'
