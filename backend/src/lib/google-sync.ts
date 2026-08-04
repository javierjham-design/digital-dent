// ─────────────────────────────────────────────────────────────────────────────
//  Sincronización bidireccional con Google Calendar
// ─────────────────────────────────────────────────────────────────────────────
//
//  Push (Cláriva → Google): cuando se crea/edita/cancela una Cita o un
//  BloqueoAgenda llamamos acá. Crea/actualiza/borra el evento en el calendario
//  del doctor y persiste el `googleEventId` para futuras operaciones.
//
//  Pull (Google → Cláriva): un cron (cada ~15 min) invoca syncCalendar() por
//  cada doctor con calendarId asignado. Usa syncToken incremental para traer
//  solo los cambios. Política de reconciliación:
//    - Si el evento ya está en Cláriva (matcheamos por googleEventId): Cláriva
//      gana — descartamos los cambios y re-pusheamos la versión nuestra.
//    - Si el evento es nuevo: lo materializamos como BloqueoAgenda (los
//      pacientes solo se crean en Cláriva; eventos externos van como bloqueo).
//
//  Todos los errores son "best-effort": si Google falla, persistimos el error
//  en googleSyncError y dejamos que el siguiente ciclo lo reintente. Nunca
//  fallamos la operación primaria por un problema con Google.
//
//  Database-per-tenant: cada función opera sobre el cliente de la base de UNA
//  clínica. El cron (syncAllMappedUsers) recorre el control-plane y abre cada
//  base por separado.
// ─────────────────────────────────────────────────────────────────────────────

import { google, calendar_v3 } from 'googleapis'
import { control } from '@/db/control'
import { tenantClient, disposeTenant, type TenantClient } from '@/db/tenant'
import { getAuthorizedClient } from '@/lib/google'
import { log, serializeError } from '@/lib/logger'
import { captureError } from '@/lib/observability'

const TIMEZONE = 'America/Santiago'
const PULL_WINDOW_DAYS_FUTURE = 90

// Umbral del "dead-man's switch": si el último sync exitoso de un doctor mapeado
// es más viejo que esto, la clínica se considera DESACTUALIZADA aunque no haya
// ningún error registrado. Cubre el modo de falla real (el cron dejó de correr y
// nadie se enteró), no solo el token revocado. Cron cada 15 min → default 60.
const STALE_MINUTOS = Number(process.env.GOOGLE_SYNC_STALE_MINUTES) || 60

// ── Estado de la sincronización (visible para la clínica) ────────────────────

// ¿El error viene de credenciales inválidas (token revocado/vencido sin refresh)?
// Solo esos meritan marcar la conexión como caída; los fallos transitorios de red
// se reintentan solos en el siguiente ciclo.
function isAuthError(e: unknown): boolean {
  const anyE = e as { code?: number; response?: { status?: number } }
  const code = anyE?.code ?? anyE?.response?.status
  if (code === 401 || code === 403) return true
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase()
  return msg.includes('invalid_grant') || msg.includes('token has been expired or revoked') ||
    msg.includes('no devolvió refresh_token') || msg.includes('no refresh token')
}

async function markGoogleSyncError(db: TenantClient, e: unknown): Promise<void> {
  const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300)
  await db.configuracion.update({
    where: { id: 'singleton' },
    data: { googleSyncError: msg, googleSyncErrorAt: new Date() },
  }).catch(() => {})
}

async function clearGoogleSyncError(db: TenantClient): Promise<void> {
  // updateMany con condición para no escribir si ya estaba limpio.
  await db.configuracion.updateMany({
    where: { id: 'singleton', NOT: { googleSyncError: null } },
    data: { googleSyncError: null, googleSyncErrorAt: null },
  }).catch(() => {})
}

export interface GoogleHealth {
  connected: boolean
  problema: 'error' | 'desactualizado' | null
  desde: string | null       // ISO — cuándo empezó el problema (error o último sync)
  ultimoSync: string | null  // ISO — último sync exitoso de cualquier doctor mapeado
  email: string | null
  doctoresMapeados: number
  staleMinutos: number
}

/**
 * Estado de salud de la integración con Google de UNA clínica, pensado para
 * mostrarlo en la UI (Configuración + Agenda). Dos formas de problema:
 *   - 'error': hay un fallo de auth registrado (token revocado/vencido).
 *   - 'desactualizado': está conectada y con doctores mapeados, pero el último
 *     sync exitoso es más viejo que STALE_MINUTOS (el cron dejó de correr).
 * Si no está conectada, o está conectada y al día → problema = null.
 */
export async function getGoogleHealth(db: TenantClient): Promise<GoogleHealth> {
  const cfg = await db.configuracion.findUnique({
    where: { id: 'singleton' },
    select: {
      googleRefreshToken: true, googleAccountEmail: true,
      googleSyncError: true, googleSyncErrorAt: true,
    },
  })
  if (!cfg?.googleRefreshToken) {
    return { connected: false, problema: null, desde: null, ultimoSync: null, email: null, doctoresMapeados: 0, staleMinutos: STALE_MINUTOS }
  }

  const agg = await db.user.aggregate({
    where: { activo: true, googleCalendarId: { not: null } },
    _max: { googleSyncedAt: true },
    _count: { _all: true },
  })
  const doctores = agg._count._all
  const ultimoSync = agg._max.googleSyncedAt

  let problema: GoogleHealth['problema'] = null
  let desde: Date | null = null
  if (cfg.googleSyncError) {
    problema = 'error'; desde = cfg.googleSyncErrorAt ?? null
  } else if (doctores > 0) {
    const vencido = !ultimoSync || Date.now() - ultimoSync.getTime() > STALE_MINUTOS * 60 * 1000
    if (vencido) { problema = 'desactualizado'; desde = ultimoSync ?? null }
  }

  return {
    connected: true,
    problema,
    desde: desde ? desde.toISOString() : null,
    ultimoSync: ultimoSync ? ultimoSync.toISOString() : null,
    email: cfg.googleAccountEmail ?? null,
    doctoresMapeados: doctores,
    staleMinutos: STALE_MINUTOS,
  }
}

// Backstop para el push/delete disparado en segundo plano desde los services.
// Esas funciones ya loguean y reportan sus propios errores; esto solo deja
// registrado un rechazo inesperado de la promesa (en vez de un `.catch(()=>{})`).
export const swallowGoogle = (op: string) => (e: unknown): void => {
  log.warn(`google ${op}: rechazo inesperado en segundo plano`, { err: serializeError(e) })
  captureError(e, { route: `google/${op}` })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function citaTitle(c: { paciente: { nombre: string; apellido: string } | null; tipo: string | null; sobrecupo: boolean }): string {
  if (!c.paciente) return `${c.sobrecupo ? '[Sobrecupo] ' : ''}${c.tipo ?? 'Cita'}`
  const tipo = c.tipo && c.tipo !== 'CONSULTA' ? ` · ${c.tipo}` : ''
  return `${c.sobrecupo ? '[Sobrecupo] ' : ''}${c.paciente.nombre} ${c.paciente.apellido}${tipo}`
}

function bloqueoTitle(b: { motivo: string | null }): string {
  return b.motivo ? `🚫 ${b.motivo}` : '🚫 Bloqueo'
}

function citaDescription(c: {
  paciente: { rut: string | null; telefono: string | null } | null
  notas: string | null
  estado: string
}): string {
  const parts: string[] = []
  if (c.paciente?.rut) parts.push(`RUT: ${c.paciente.rut}`)
  if (c.paciente?.telefono) parts.push(`Teléfono: ${c.paciente.telefono}`)
  parts.push(`Estado: ${c.estado}`)
  if (c.notas) parts.push(`\nNotas: ${c.notas}`)
  parts.push('\n— Sincronizado desde Cláriva. No editar en Google: los cambios se sobrescriben.')
  return parts.join('\n')
}

function bloqueoDescription(): string {
  return 'Bloqueo de agenda gestionado en Cláriva.\nNo editar en Google: los cambios se sobrescriben.'
}

async function getCalendarClient(db: TenantClient) {
  const auth = await getAuthorizedClient(db)
  if (!auth) return null
  return google.calendar({ version: 'v3', auth })
}

// ─── Matching de paciente desde el título de un evento ──────────────────────
// Las citas de Dentalink (que ya están en los calendars de Google) tienen el
// nombre del paciente en el título. Intentamos matchear contra los pacientes
// activos de la clínica. Si hay UN match unívoco → es una cita real;
// si hay múltiples (homónimos) o cero → bloqueo.

function normalize(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sin tildes
    .replace(/[^a-z0-9\s]/g, ' ')                     // sin puntuación
    .replace(/\s+/g, ' ')
    .trim()
}

export async function findMatchingPaciente(db: TenantClient, titulo: string): Promise<string | null> {
  if (!titulo || !titulo.trim()) return null
  const t = normalize(titulo)
  if (t.length < 4) return null

  const pacientes = await db.paciente.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, apellido: true },
  })

  const matches = new Set<string>()
  for (const p of pacientes) {
    const n = normalize(p.nombre)
    const a = normalize(p.apellido)
    if (!n || !a) continue
    // Match si el título contiene "nombre apellido" o "apellido nombre"
    // (ambos órdenes son comunes en agendas dentales).
    if (t.includes(`${n} ${a}`) || t.includes(`${a} ${n}`)) {
      matches.add(p.id)
    }
  }
  if (matches.size !== 1) return null
  return Array.from(matches)[0]
}

// ─── Push: CITAS ────────────────────────────────────────────────────────────

/**
 * Crea o actualiza el evento de una cita en Google Calendar. Idempotente:
 * si la cita ya tiene `googleEventId` hace PATCH; si no, hace INSERT y
 * persiste el id devuelto.
 *
 * Devuelve silenciosamente si:
 *   - el doctor no tiene calendarId asignado, o
 *   - la clínica no tiene conexión con Google, o
 *   - la cita está cancelada (en ese caso usamos `deleteCitaInGoogle`).
 */
export async function pushCita(db: TenantClient, citaId: string): Promise<void> {
  const cita = await db.cita.findUnique({
    where: { id: citaId },
    include: {
      paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } },
      doctor: { select: { id: true, name: true, email: true, googleCalendarId: true } },
    },
  })
  if (!cita || !cita.doctor.googleCalendarId) return

  const calendar = await getCalendarClient(db)
  if (!calendar) return

  const calendarId = cita.doctor.googleCalendarId
  const start = cita.fecha
  const end = new Date(start.getTime() + cita.duracion * 60 * 1000)

  const eventBody: calendar_v3.Schema$Event = {
    summary: citaTitle(cita),
    description: citaDescription(cita),
    start: { dateTime: start.toISOString(), timeZone: TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: TIMEZONE },
    location: cita.sala ?? undefined,
    extendedProperties: { private: { clarivaCitaId: cita.id, clarivaKind: 'cita' } },
  }

  try {
    let googleEventId = cita.googleEventId
    if (googleEventId) {
      await calendar.events.patch({ calendarId, eventId: googleEventId, requestBody: eventBody })
    } else {
      const res = await calendar.events.insert({ calendarId, requestBody: eventBody })
      googleEventId = res.data.id ?? null
    }
    await db.cita.update({
      where: { id: cita.id },
      data: { googleEventId, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'push_failed'
    log.warn('google pushCita falló', { citaId: cita.id, err: serializeError(e) })
    captureError(e, { route: 'google/pushCita' })
    if (isAuthError(e)) await markGoogleSyncError(db, e)
    await db.cita.update({
      where: { id: cita.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

/**
 * Borra el evento asociado a una cita en Google. Se usa cuando la cita pasa
 * a CANCELADA o se elimina. Si la cita no tiene googleEventId no hace nada.
 */
export async function deleteCitaInGoogle(db: TenantClient, citaId: string): Promise<void> {
  const cita = await db.cita.findUnique({
    where: { id: citaId },
    include: { doctor: { select: { googleCalendarId: true } } },
  })
  if (!cita || !cita.googleEventId || !cita.doctor.googleCalendarId) return

  const calendar = await getCalendarClient(db)
  if (!calendar) return

  try {
    await calendar.events.delete({
      calendarId: cita.doctor.googleCalendarId,
      eventId: cita.googleEventId,
    })
    await db.cita.update({
      where: { id: cita.id },
      data: { googleEventId: null, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete_failed'
    log.warn('google deleteCita falló', { citaId: cita.id, err: serializeError(e) })
    captureError(e, { route: 'google/deleteCita' })
    if (isAuthError(e)) await markGoogleSyncError(db, e)
    await db.cita.update({
      where: { id: cita.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

// ─── Push: BLOQUEOS ─────────────────────────────────────────────────────────

export async function pushBloqueo(db: TenantClient, bloqueoId: string): Promise<void> {
  const bloqueo = await db.bloqueoAgenda.findUnique({
    where: { id: bloqueoId },
    include: {
      doctor: { select: { id: true, googleCalendarId: true } },
    },
  })
  if (!bloqueo || !bloqueo.doctor.googleCalendarId) return

  const calendar = await getCalendarClient(db)
  if (!calendar) return

  const calendarId = bloqueo.doctor.googleCalendarId

  const eventBody: calendar_v3.Schema$Event = {
    summary: bloqueoTitle(bloqueo),
    description: bloqueoDescription(),
    start: { dateTime: bloqueo.inicio.toISOString(), timeZone: TIMEZONE },
    end:   { dateTime: bloqueo.fin.toISOString(),    timeZone: TIMEZONE },
    transparency: 'opaque',
    extendedProperties: { private: { clarivaBloqueoId: bloqueo.id, clarivaKind: 'bloqueo' } },
  }

  try {
    let googleEventId = bloqueo.googleEventId
    if (googleEventId) {
      await calendar.events.patch({ calendarId, eventId: googleEventId, requestBody: eventBody })
    } else {
      const res = await calendar.events.insert({ calendarId, requestBody: eventBody })
      googleEventId = res.data.id ?? null
    }
    await db.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleEventId, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'push_failed'
    log.warn('google pushBloqueo falló', { bloqueoId: bloqueo.id, err: serializeError(e) })
    captureError(e, { route: 'google/pushBloqueo' })
    if (isAuthError(e)) await markGoogleSyncError(db, e)
    await db.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

export async function deleteBloqueoInGoogle(db: TenantClient, bloqueoId: string): Promise<void> {
  const bloqueo = await db.bloqueoAgenda.findUnique({
    where: { id: bloqueoId },
    include: { doctor: { select: { googleCalendarId: true } } },
  })
  if (!bloqueo || !bloqueo.googleEventId || !bloqueo.doctor.googleCalendarId) return

  const calendar = await getCalendarClient(db)
  if (!calendar) return

  try {
    await calendar.events.delete({
      calendarId: bloqueo.doctor.googleCalendarId,
      eventId: bloqueo.googleEventId,
    })
    await db.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleEventId: null, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete_failed'
    log.warn('google deleteBloqueo falló', { bloqueoId: bloqueo.id, err: serializeError(e) })
    captureError(e, { route: 'google/deleteBloqueo' })
    if (isAuthError(e)) await markGoogleSyncError(db, e)
    await db.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

// ─── Pull: traer cambios desde Google ───────────────────────────────────────

export interface SyncSummary {
  userId: string
  doctor: string
  changed: number
  newBloqueos: number
  newCitas: number
  reAsserted: number
  fullResync: boolean
  error: string | null
}

/**
 * Sincroniza un calendario de un doctor desde Google. Si el doctor no tiene
 * syncToken se hace un full snapshot acotado a la ventana futura
 * (PULL_WINDOW_DAYS_FUTURE). En sucesivas llamadas usa el syncToken
 * para traer solo los cambios.
 *
 * Reconciliación por evento:
 *   1. event.status === 'cancelled' → si lo conocemos, lo marcamos cancelado.
 *   2. extendedProperties.private.clarivaKind: ya viene de Cláriva → Cláriva
 *      sigue siendo source-of-truth, re-pusheamos para sobrescribir cambios
 *      manuales que el dentista haya hecho en Google.
 *   3. Sin marca de Cláriva → evento "ajeno", lo materializamos como
 *      BloqueoAgenda (los pacientes solo se crean en Cláriva).
 */
export async function syncCalendar(db: TenantClient, userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    userId, doctor: '—', changed: 0, newBloqueos: 0, newCitas: 0, reAsserted: 0, fullResync: false, error: null,
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true,
      googleCalendarId: true, googleSyncToken: true,
    },
  })
  if (!user || !user.googleCalendarId) {
    summary.error = 'no_calendar_mapped'
    return summary
  }
  summary.doctor = user.name ?? user.email ?? user.id

  // Obtener/refrescar credenciales puede fallar si el token fue revocado o venció
  // sin refresh. Antes eso reventaba syncCalendar en silencio; ahora lo marcamos.
  let calendar: calendar_v3.Calendar | null
  try {
    calendar = await getCalendarClient(db)
  } catch (e) {
    if (isAuthError(e)) await markGoogleSyncError(db, e)
    log.warn('google sync: no se pudo autenticar', { userId, err: serializeError(e) })
    captureError(e, { route: 'google/sync' })
    summary.error = 'auth_failed'
    return summary
  }
  if (!calendar) { summary.error = 'no_google_connection'; return summary }

  const calendarId = user.googleCalendarId

  // Acumulamos eventos en memoria paginando hasta tener todos.
  const events: calendar_v3.Schema$Event[] = []
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  const tokenOnEntry = user.googleSyncToken
  const initialPullStart = !tokenOnEntry ? new Date() : null
  const initialPullEnd = !tokenOnEntry
    ? new Date(Date.now() + PULL_WINDOW_DAYS_FUTURE * 24 * 60 * 60 * 1000)
    : null

  try {
    do {
      const res = await calendar.events.list({
        calendarId,
        // Si tenemos syncToken NO podemos pasar timeMin/timeMax/etc.
        ...(tokenOnEntry
          ? { syncToken: tokenOnEntry, pageToken }
          : {
              singleEvents: true,
              showDeleted: false,
              timeMin: initialPullStart!.toISOString(),
              timeMax: initialPullEnd!.toISOString(),
              pageToken,
              maxResults: 250,
            }),
      })
      events.push(...(res.data.items ?? []))
      pageToken = res.data.nextPageToken ?? undefined
      if (!pageToken) nextSyncToken = res.data.nextSyncToken ?? undefined
    } while (pageToken)
  } catch (e: any) {
    // 410 Gone = syncToken expirado. Reseteamos y la próxima ejecución hará full.
    if (e?.code === 410 || e?.response?.status === 410) {
      await db.user.update({ where: { id: user.id }, data: { googleSyncToken: null } })
      summary.fullResync = true
      summary.error = 'sync_token_expired_reset'
      return summary
    }
    if (isAuthError(e)) await markGoogleSyncError(db, e)
    log.warn('google sync: fallo al traer eventos', { userId, err: serializeError(e) })
    captureError(e, { route: 'google/sync' })
    summary.error = e instanceof Error ? e.message.slice(0, 200) : 'pull_failed'
    return summary
  }

  for (const ev of events) {
    try {
      const result = await reconcileEvent(db, user.id, calendarId, ev, calendar)
      if (result === 'cancelled' || result === 'updated') summary.changed++
      if (result === 'bloqueo_created') summary.newBloqueos++
      if (result === 'cita_imported') summary.newCitas++
      if (result === 're_asserted') summary.reAsserted++
    } catch {
      // No abortar todo el sync por un evento; el siguiente ciclo lo reintenta.
    }
  }

  if (nextSyncToken) {
    await db.user.update({
      where: { id: user.id },
      data: { googleSyncToken: nextSyncToken, googleSyncedAt: new Date() },
    })
  } else {
    await db.user.update({
      where: { id: user.id },
      data: { googleSyncedAt: new Date() },
    })
  }

  // Sync exitoso → la conexión está sana: limpiamos cualquier error previo.
  await clearGoogleSyncError(db)
  return summary
}

type ReconcileResult = 'cancelled' | 'updated' | 'bloqueo_created' | 'cita_imported' | 're_asserted' | 'ignored'

async function reconcileEvent(
  db: TenantClient,
  doctorId: string,
  calendarId: string,
  ev: calendar_v3.Schema$Event,
  calendar: calendar_v3.Calendar,
): Promise<ReconcileResult> {
  if (!ev.id) return 'ignored'

  // 1) Evento cancelado en Google → reflejamos en Cláriva.
  if (ev.status === 'cancelled') {
    const cita = await db.cita.findFirst({ where: { googleEventId: ev.id } })
    if (cita) {
      await db.cita.update({
        where: { id: cita.id },
        data: { estado: 'CANCELADA', googleEventId: null, googleSyncedAt: new Date() },
      })
      return 'cancelled'
    }
    const bloqueo = await db.bloqueoAgenda.findFirst({ where: { googleEventId: ev.id } })
    if (bloqueo) {
      await db.bloqueoAgenda.delete({ where: { id: bloqueo.id } })
      return 'cancelled'
    }
    return 'ignored'
  }

  const start = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00` : null)
  const end   = ev.end?.dateTime   ?? (ev.end?.date   ? `${ev.end.date}T23:59:59`   : null)
  if (!start || !end) return 'ignored'
  const startDate = new Date(start)
  const endDate = new Date(end)

  // 2) Evento ya generado por Cláriva. Cláriva gana → re-pusheamos para
  //    sobrescribir cualquier edición manual que el dentista haya hecho.
  const kind = ev.extendedProperties?.private?.clarivaKind
  if (kind === 'cita') {
    const cita = await db.cita.findFirst({ where: { googleEventId: ev.id } })
    if (cita) {
      // Disparar push para reescribir Google con la versión nuestra.
      await pushCita(db, cita.id)
      return 're_asserted'
    }
  }
  if (kind === 'bloqueo') {
    const bloqueo = await db.bloqueoAgenda.findFirst({ where: { googleEventId: ev.id } })
    if (bloqueo) {
      await pushBloqueo(db, bloqueo.id)
      return 're_asserted'
    }
  }

  // 3) Evento ajeno: ¿ya lo materializamos como bloqueo en pulls anteriores?
  const existingBloqueo = await db.bloqueoAgenda.findFirst({ where: { googleEventId: ev.id } })
  if (existingBloqueo) {
    // Actualizamos rango y motivo si cambiaron.
    const newMotivo = ev.summary ?? existingBloqueo.motivo ?? null
    if (
      existingBloqueo.inicio.getTime() !== startDate.getTime() ||
      existingBloqueo.fin.getTime()    !== endDate.getTime()   ||
      (existingBloqueo.motivo ?? null) !== newMotivo
    ) {
      await db.bloqueoAgenda.update({
        where: { id: existingBloqueo.id },
        data: { inicio: startDate, fin: endDate, motivo: newMotivo, googleSyncedAt: new Date() },
      })
      return 'updated'
    }
    return 'ignored'
  }

  // 4) Evento nuevo y ajeno: intentar matchear el título contra los pacientes
  //    de la clínica. Si hay un match unívoco lo creamos como Cita real (caso
  //    importación inicial desde Dentalink); si no, bloqueo.
  const summary = ev.summary ?? ''
  const pacienteId = await findMatchingPaciente(db, summary)
  const duracionMin = Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60000))

  if (pacienteId) {
    await db.cita.create({
      data: {
        pacienteId,
        doctorId,
        fecha: startDate,
        duracion: duracionMin,
        estado: 'CONFIRMADO',
        tipo: 'CONSULTA',
        googleEventId: ev.id,
        googleSyncedAt: new Date(),
        logs: {
          create: {
            tipo: 'AGENDADA',
            detalle: `Importada de Google Calendar (título: "${summary}")`,
            userName: 'Google Calendar',
          },
        },
      },
    })
    return 'cita_imported'
  }

  await db.bloqueoAgenda.create({
    data: {
      doctorId,
      inicio: startDate,
      fin: endDate,
      motivo: summary || 'Bloqueo importado de Google',
      createdByName: 'Google Calendar',
      googleEventId: ev.id,
      googleSyncedAt: new Date(),
    },
  })
  return 'bloqueo_created'
}

// ─── Pull para todos los users con calendario mapeado (cron) ────────────────
// Recorre el control-plane y, por cada clínica activa con Google conectado,
// abre su base y sincroniza los doctores con calendario asignado.

export async function syncAllMappedUsers(): Promise<SyncSummary[]> {
  const clinicas = await control.clinica.findMany({
    where: { activo: true, esDemo: false },
    select: { dbName: true },
  })

  const out: SyncSummary[] = []
  for (const cl of clinicas) {
    const db = tenantClient(cl.dbName)
    try {
      const config = await db.configuracion.findUnique({
        where: { id: 'singleton' },
        select: { googleRefreshToken: true },
      })
      if (!config?.googleRefreshToken) continue

      const users = await db.user.findMany({
        where: { activo: true, googleCalendarId: { not: null } },
        select: { id: true },
      })
      for (const u of users) out.push(await syncCalendar(db, u.id))
    } finally {
      // El cron corre cada ~15 min y el cache de clientes de tenant.ts no expira:
      // sin descartar el cliente, cada corrida filtraría una conexión por clínica.
      await disposeTenant(cl.dbName)
    }
  }
  return out
}
