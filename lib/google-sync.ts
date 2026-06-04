// ─────────────────────────────────────────────────────────────────────────────
//  Sincronización bidireccional con Google Calendar
// ─────────────────────────────────────────────────────────────────────────────
//
//  Push (Cláriva → Google): cuando se crea/edita/cancela una Cita o un
//  BloqueoAgenda llamamos acá. Crea/actualiza/borra el evento en el calendario
//  del doctor y persiste el `googleEventId` para futuras operaciones.
//
//  Pull (Google → Cláriva): un cron cada 2 minutos invoca syncCalendar() por
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
// ─────────────────────────────────────────────────────────────────────────────

import { google, calendar_v3 } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { getAuthorizedClient } from '@/lib/google'

const TIMEZONE = 'America/Santiago'
const PULL_WINDOW_DAYS_FUTURE = 90

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

async function getCalendarClient(clinicaId: string) {
  const auth = await getAuthorizedClient(clinicaId)
  if (!auth) return null
  return google.calendar({ version: 'v3', auth })
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
export async function pushCita(citaId: string): Promise<void> {
  const cita = await prisma.cita.findUnique({
    where: { id: citaId },
    include: {
      paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } },
      doctor: { select: { id: true, name: true, email: true, googleCalendarId: true, clinicaId: true } },
    },
  })
  if (!cita || !cita.doctor.googleCalendarId || !cita.doctor.clinicaId) return

  const calendar = await getCalendarClient(cita.doctor.clinicaId)
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
    await prisma.cita.update({
      where: { id: cita.id },
      data: { googleEventId, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'push_failed'
    await prisma.cita.update({
      where: { id: cita.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

/**
 * Borra el evento asociado a una cita en Google. Se usa cuando la cita pasa
 * a CANCELADA o se elimina. Si la cita no tiene googleEventId no hace nada.
 */
export async function deleteCitaInGoogle(citaId: string): Promise<void> {
  const cita = await prisma.cita.findUnique({
    where: { id: citaId },
    include: { doctor: { select: { googleCalendarId: true, clinicaId: true } } },
  })
  if (!cita || !cita.googleEventId || !cita.doctor.googleCalendarId || !cita.doctor.clinicaId) return

  const calendar = await getCalendarClient(cita.doctor.clinicaId)
  if (!calendar) return

  try {
    await calendar.events.delete({
      calendarId: cita.doctor.googleCalendarId,
      eventId: cita.googleEventId,
    })
    await prisma.cita.update({
      where: { id: cita.id },
      data: { googleEventId: null, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete_failed'
    await prisma.cita.update({
      where: { id: cita.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

// ─── Push: BLOQUEOS ─────────────────────────────────────────────────────────

export async function pushBloqueo(bloqueoId: string): Promise<void> {
  const bloqueo = await prisma.bloqueoAgenda.findUnique({
    where: { id: bloqueoId },
    include: {
      doctor: { select: { id: true, googleCalendarId: true, clinicaId: true } },
    },
  })
  if (!bloqueo || !bloqueo.doctor.googleCalendarId || !bloqueo.doctor.clinicaId) return

  const calendar = await getCalendarClient(bloqueo.doctor.clinicaId)
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
    await prisma.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleEventId, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'push_failed'
    await prisma.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleSyncError: msg.slice(0, 500) },
    }).catch(() => {})
  }
}

export async function deleteBloqueoInGoogle(bloqueoId: string): Promise<void> {
  const bloqueo = await prisma.bloqueoAgenda.findUnique({
    where: { id: bloqueoId },
    include: { doctor: { select: { googleCalendarId: true, clinicaId: true } } },
  })
  if (!bloqueo || !bloqueo.googleEventId || !bloqueo.doctor.googleCalendarId || !bloqueo.doctor.clinicaId) return

  const calendar = await getCalendarClient(bloqueo.doctor.clinicaId)
  if (!calendar) return

  try {
    await calendar.events.delete({
      calendarId: bloqueo.doctor.googleCalendarId,
      eventId: bloqueo.googleEventId,
    })
    await prisma.bloqueoAgenda.update({
      where: { id: bloqueo.id },
      data: { googleEventId: null, googleSyncedAt: new Date(), googleSyncError: null },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete_failed'
    await prisma.bloqueoAgenda.update({
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
export async function syncCalendar(userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    userId, doctor: '—', changed: 0, newBloqueos: 0, reAsserted: 0, fullResync: false, error: null,
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, clinicaId: true,
      googleCalendarId: true, googleSyncToken: true,
    },
  })
  if (!user || !user.clinicaId || !user.googleCalendarId) {
    summary.error = 'no_calendar_mapped'
    return summary
  }
  summary.doctor = user.name ?? user.email ?? user.id

  const calendar = await getCalendarClient(user.clinicaId)
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
      await prisma.user.update({ where: { id: user.id }, data: { googleSyncToken: null } })
      summary.fullResync = true
      summary.error = 'sync_token_expired_reset'
      return summary
    }
    summary.error = e instanceof Error ? e.message.slice(0, 200) : 'pull_failed'
    return summary
  }

  for (const ev of events) {
    try {
      const result = await reconcileEvent(user.clinicaId, user.id, calendarId, ev, calendar)
      if (result === 'cancelled' || result === 'updated') summary.changed++
      if (result === 'bloqueo_created') summary.newBloqueos++
      if (result === 're_asserted') summary.reAsserted++
    } catch {
      // No abortar todo el sync por un evento; el siguiente ciclo lo reintenta.
    }
  }

  if (nextSyncToken) {
    await prisma.user.update({
      where: { id: user.id },
      data: { googleSyncToken: nextSyncToken, googleSyncedAt: new Date() },
    })
  } else {
    await prisma.user.update({
      where: { id: user.id },
      data: { googleSyncedAt: new Date() },
    })
  }

  return summary
}

type ReconcileResult = 'cancelled' | 'updated' | 'bloqueo_created' | 're_asserted' | 'ignored'

async function reconcileEvent(
  clinicaId: string,
  doctorId: string,
  calendarId: string,
  ev: calendar_v3.Schema$Event,
  calendar: calendar_v3.Calendar,
): Promise<ReconcileResult> {
  if (!ev.id) return 'ignored'

  // 1) Evento cancelado en Google → reflejamos en Cláriva.
  if (ev.status === 'cancelled') {
    const cita = await prisma.cita.findFirst({ where: { googleEventId: ev.id, clinicaId } })
    if (cita) {
      await prisma.cita.update({
        where: { id: cita.id },
        data: { estado: 'CANCELADA', googleEventId: null, googleSyncedAt: new Date() },
      })
      return 'cancelled'
    }
    const bloqueo = await prisma.bloqueoAgenda.findFirst({ where: { googleEventId: ev.id, clinicaId } })
    if (bloqueo) {
      await prisma.bloqueoAgenda.delete({ where: { id: bloqueo.id } })
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
    const cita = await prisma.cita.findFirst({ where: { googleEventId: ev.id, clinicaId } })
    if (cita) {
      // Disparar push para reescribir Google con la versión nuestra.
      await pushCita(cita.id)
      return 're_asserted'
    }
  }
  if (kind === 'bloqueo') {
    const bloqueo = await prisma.bloqueoAgenda.findFirst({ where: { googleEventId: ev.id, clinicaId } })
    if (bloqueo) {
      await pushBloqueo(bloqueo.id)
      return 're_asserted'
    }
  }

  // 3) Evento ajeno: ¿ya lo materializamos como bloqueo en pulls anteriores?
  const existingBloqueo = await prisma.bloqueoAgenda.findFirst({ where: { googleEventId: ev.id, clinicaId } })
  if (existingBloqueo) {
    // Actualizamos rango y motivo si cambiaron.
    const newMotivo = ev.summary ?? existingBloqueo.motivo ?? null
    if (
      existingBloqueo.inicio.getTime() !== startDate.getTime() ||
      existingBloqueo.fin.getTime()    !== endDate.getTime()   ||
      (existingBloqueo.motivo ?? null) !== newMotivo
    ) {
      await prisma.bloqueoAgenda.update({
        where: { id: existingBloqueo.id },
        data: { inicio: startDate, fin: endDate, motivo: newMotivo, googleSyncedAt: new Date() },
      })
      return 'updated'
    }
    return 'ignored'
  }

  // 4) Evento nuevo y ajeno → crear como BloqueoAgenda.
  await prisma.bloqueoAgenda.create({
    data: {
      clinicaId,
      doctorId,
      inicio: startDate,
      fin: endDate,
      motivo: ev.summary ?? 'Bloqueo importado de Google',
      createdByName: 'Google Calendar',
      googleEventId: ev.id,
      googleSyncedAt: new Date(),
    },
  })
  return 'bloqueo_created'
}

// ─── Pull para todos los users con calendario mapeado (cron) ────────────────

export async function syncAllMappedUsers(): Promise<SyncSummary[]> {
  const users = await prisma.user.findMany({
    where: {
      activo: true,
      googleCalendarId: { not: null },
      clinica: { googleRefreshToken: { not: null } },
    },
    select: { id: true },
  })
  const out: SyncSummary[] = []
  for (const u of users) {
    out.push(await syncCalendar(u.id))
  }
  return out
}
