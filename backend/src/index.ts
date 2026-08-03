import '@/instrument' // Sentry.init lo primero, antes de cargar el resto de la app
import { createApp } from '@/app'
import { env } from '@/config/env'
import { log, serializeError } from '@/lib/logger'
import { captureError, flushSentry } from '@/lib/observability'
import { dedupePrestacionesTodasLasClinicas } from '@/lib/maintenance'

// Errores de proceso: antes se caían sin dejar rastro. Ahora se loguean y se
// reportan a Sentry. Una promesa rechazada sin catch NO tumba el server (se
// registra y sigue, para no dejar a las clínicas sin API por un descuido); una
// excepción no capturada sí sale (estado corrupto) para que Railway reinicie limpio.
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { err: serializeError(reason) })
  captureError(reason)
})
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { err: serializeError(err) })
  captureError(err)
  void flushSentry(2000).finally(() => process.exit(1))
})

const app = createApp()

app.listen(env.port, () => {
  log.info('clariva-backend escuchando', { url: `http://localhost:${env.port}`, env: env.nodeEnv })
  // Mantenimiento al arrancar (no bloquea): fusiona prestaciones duplicadas en
  // todas las clínicas. Se puede desactivar con DISABLE_STARTUP_MAINTENANCE=1.
  if (process.env.DISABLE_STARTUP_MAINTENANCE !== '1') {
    void dedupePrestacionesTodasLasClinicas()
  }
})
