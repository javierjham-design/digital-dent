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
  // Secreto para firmar los JWT que emite ESTE backend.
  jwtSecret: required('JWT_SECRET', process.env.NEXTAUTH_SECRET ?? 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  // Orígenes permitidos para CORS (el frontend Vite).
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',
  cronSecret: process.env.CRON_SECRET ?? '',
}

export const isProd = env.nodeEnv === 'production'
