// Job de cron: hace un POST autenticado (x-cron-secret) al backend según JOB.
// Railway ejecuta este comando según el cronSchedule del servicio y luego sale.
// Env requeridas: API_URL (base del backend), CRON_SECRET, JOB.
const API = (process.env.API_URL ?? '').replace(/\/$/, '')
const SECRET = process.env.CRON_SECRET ?? ''
const JOB = process.env.JOB ?? 'cleanup'

const PATHS = {
  recordatorios: '/api/v1/whatsapp/recordatorios', // recordatorios de cita por WhatsApp
  sync: '/api/v1/google/sync',                     // sincronización con Google Calendar
  cleanup: '/api/v1/demo/cleanup',                 // borrado de clínicas demo expiradas
}

const path = PATHS[JOB]
if (!API || !path) {
  console.error(`[cron] config inválida: API_URL="${API}" JOB="${JOB}" (válidos: ${Object.keys(PATHS).join(', ')})`)
  process.exit(1)
}

const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'x-cron-secret': SECRET } })
const body = await res.text()
console.log(`[cron:${JOB}] ${res.status} ${body.slice(0, 300)}`)
process.exit(res.ok ? 0 : 1)
