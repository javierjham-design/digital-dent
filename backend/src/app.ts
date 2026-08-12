import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from '@/config/env'
import { control } from '@/db/control'
import { apiRouter } from '@/routes/index'
import { errorMiddleware, notFoundMiddleware } from '@/middlewares/error'
import { requestContext } from '@/middlewares/request-context'
import { log } from '@/lib/logger'

// Ping a la base con timeout corto: el healthcheck no puede quedarse colgado si
// Postgres deja de responder (debe fallar rápido para que Railway reinicie).
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// Permite un origin si está en la lista explícita o si es el dominio de la
// plataforma o cualquiera de sus subdominios (cada clínica = <slug>.dominio).
function corsOriginAllowed(origin: string): boolean {
  if (env.corsOrigins.includes(origin)) return true
  if (!env.platformDomain) return false
  let host: string
  try { host = new URL(origin).hostname.toLowerCase() } catch { return false }
  return host === env.platformDomain || host.endsWith(`.${env.platformDomain}`)
}

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  // Detrás del proxy de Railway: confiar en X-Forwarded-* para obtener la IP
  // real del cliente (rate-limit por IP, logs).
  app.set('trust proxy', 1)
  // Request-id + contexto de logging: lo primero, para trazar TODO (incl. /health).
  app.use(requestContext)
  app.use(helmet())

  // CORS ABIERTO para las rutas públicas (/api/v1/public/*): el intake de leads y
  // la reserva/formulario se llaman desde landings y formularios EXTERNOS
  // (cross-origin, p. ej. https://digital-dent.cl), sin cookies ni credenciales.
  // Va ANTES del CORS estricto y resuelve el preflight (OPTIONS → 204); el CORS
  // con credenciales del resto de la app se salta para estas rutas para no pisarlo.
  const publicCors = cors({
    origin: true, // refleja el Origin de quien llama: permite cualquier landing externa
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  })
  app.use('/api/v1/public', publicCors)

  // CORS ESTRICTO (con credenciales) para el panel y las rutas autenticadas:
  // solo el dominio de la plataforma, sus subdominios o la lista explícita.
  const strictCors = cors({
    origin: (origin, cb) => {
      // Sin Origin (curl, server-to-server, healthcheck) → permitir.
      if (!origin) return cb(null, true)
      cb(null, corsOriginAllowed(origin))
    },
    credentials: true,
  })
  app.use((req, res, next) => {
    // Las rutas públicas ya las manejó publicCors; no aplicar el CORS estricto.
    if (req.path.startsWith('/api/v1/public/')) return next()
    return strictCors(req, res, next)
  })

  // 15MB: los correos con PDF adjunto (presupuestos, consentimientos) viajan como base64.
  // `verify` guarda el raw body (para verificar la firma HMAC de webhooks, ej. Lemon Squeezy).
  app.use(express.json({
    limit: '15mb',
    verify: (req, _res, buf) => { (req as express.Request & { rawBody?: Buffer }).rawBody = buf },
  }))
  // El webhook de Flow (confirmación de pago) llega como application/x-www-form-urlencoded.
  // (El webhook de TuBot es JSON y verifica su firma sobre el rawBody de express.json.)
  app.use(express.urlencoded({ extended: false }))
  app.use(cookieParser())

  // Healthcheck REAL para Railway / monitoreo: verifica que el control-plane
  // responda (SELECT 1) con timeout corto. Si la base no responde, devuelve 503
  // para que el restartPolicy de Railway y el monitor externo se enteren (antes
  // devolvía 200 aunque Postgres estuviera caído).
  app.get('/health', async (_req, res) => {
    try {
      await withTimeout(control.$queryRaw`SELECT 1`, 2000)
      res.json({ ok: true, service: 'clariva-backend', ts: Date.now() })
    } catch (e) {
      log.error('healthcheck: control-plane no responde', { err: e instanceof Error ? e.message : String(e) })
      res.status(503).json({ ok: false, service: 'clariva-backend', error: 'db-unreachable', ts: Date.now() })
    }
  })

  app.use('/api/v1', apiRouter)

  app.use(notFoundMiddleware)
  app.use(errorMiddleware)

  return app
}
