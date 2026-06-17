import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from '@/config/env'
import { apiRouter } from '@/routes/index'
import { errorMiddleware, notFoundMiddleware } from '@/middlewares/error'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors({ origin: env.corsOrigins, credentials: true }))
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
