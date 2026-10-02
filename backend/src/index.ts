import '@/instrument' // Sentry.init lo primero, antes de cargar el resto de la app
import { createApp } from '@/app'
import { env } from '@/config/env'
import { log, serializeError } from '@/lib/logger'
import { captureError, flushSentry } from '@/lib/observability'
import { dedupePrestacionesTodasLasClinicas, backfillFormulariosTodasLasClinicas, reconciliarVinculosTodasLasClinicas, cerrarNoShowsTodasLasClinicas } from '@/lib/maintenance'
import { enviarRecapturasPendientes, esHoraDeRecaptura } from '@/lib/whatsapp'

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
    // Completa el nombre del formulario de origen en leads de Meta: al arrancar y
    // cada 30 min. Idempotente y barato (si no hay leads pendientes no llama a Graph);
    // se auto-repara si la ingesta falló o si Meta estaba con rate limit.
    void backfillFormulariosTodasLasClinicas()
    const t = setInterval(() => void backfillFormulariosTodasLasClinicas(), 30 * 60_000)
    t.unref?.()
    // Reconciliación del vínculo lead→paciente de leads RECIENTES (recupera atribución
    // cuando la ficha se creó con datos distintos). Al arrancar y cada 12 h. Solo
    // inequívocos; no toca el backlog histórico (ese va a mano con backup).
    void reconciliarVinculosTodasLasClinicas()
    const tr = setInterval(() => void reconciliarVinculosTodasLasClinicas(), 12 * 60 * 60_000)
    tr.unref?.()
    // Cierre de no-shows: marca NO_ASISTIO las citas vencidas sin asistencia (dispara la
    // recaptura a TuBot) y pasa a PERDIDO los no-shows sin respuesta. Al arrancar y cada 30 min.
    void cerrarNoShowsTodasLasClinicas()
    const tn = setInterval(() => void cerrarNoShowsTodasLasClinicas(), 30 * 60_000)
    tn.unref?.()
    // Recaptura por WhatsApp (día siguiente): no-shows → reagendar · plan sin tomar → iniciar
    // tratamiento. Gated a la mañana (hora clínica). Se chequea cada hora; sólo envía a las ~10 h
    // (idempotente, así un doble chequeo en esa hora no reenvía). Apagado hasta que el tenant
    // active cada flujo con su plantilla aprobada.
    const trc = setInterval(() => { if (esHoraDeRecaptura()) void enviarRecapturasPendientes() }, 60 * 60_000)
    trc.unref?.()
  }
})
