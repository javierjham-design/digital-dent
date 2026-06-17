import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from '@/config/env'
import { apiRouter } from '@/routes/index'
import { errorMiddleware, notFoundMiddleware } from '@/middlewares/error'

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
  app.use(helmet())
  app.use(cors({
    origin: (origin, cb) => {
      // Sin Origin (curl, server-to-server, healthcheck) → permitir.
      if (!origin) return cb(null, true)
      cb(null, corsOriginAllowed(origin))
    },
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))
  // Twilio postea el webhook como application/x-www-form-urlencoded.
  app.use(express.urlencoded({ extended: false }))
  app.use(cookieParser())

  // Healthcheck para Railway / monitoreo.
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'clariva-backend', ts: Date.now() }))

  app.use('/api/v1', apiRouter)

  app.use(notFoundMiddleware)
  app.use(errorMiddleware)

  return app
}
