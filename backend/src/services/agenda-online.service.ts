import { randomBytes, randomUUID } from 'node:crypto'
import type { TenantClient } from '@/db/tenant'
import { badRequest, conflict, notFound } from '@/lib/errors'
import { listarHorarios } from '@/services/horarios.service'
import { getMetaConfig } from '@/services/crm.service'
import { enviarEventoMeta, metaHabilitado } from '@/lib/meta'
import { ESTADOS_NO_OCUPAN } from '@shared/constants/cita-estados'
import { addMinutes, intervalsOverlap } from '@/lib/overlap'
import { validarRut, formatRut } from '@shared/utils/rut'
import { wallClockToUtc, todayYmd, addDaysYmd, weekdayOfYmd, toMin, fromMin } from '@/lib/tz'

const LINK_INCLUDE = {
  doctor: { select: { id: true, name: true, email: true, especialidad: true } },
  ventanas: { select: { id: true, diaSemana: true, horaInicio: true, horaFin: true } },
  profesionales: { include: { user: { select: { id: true, name: true, email: true, especialidad: true } } } },
} as const

// IDs de los profesionales del link (la tabla de relación; si está vacía, el primario).
function profesionalesIds(link: { doctorId: string; profesionales: { userId: string }[] }): string[] {
  const ids = link.profesionales.map((p) => p.userId)
  return ids.length > 0 ? ids : [link.doctorId]
}

type VentanaInput = { diaSemana: number; horaInicio: string; horaFin: string }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function token(): string { return randomBytes(9).toString('base64url') }

function normalizarVentanas(raw: unknown): VentanaInput[] {
  if (!Array.isArray(raw)) return []
  const out: VentanaInput[] = []
  for (const v of raw) {
    const dia = Number((v as VentanaInput).diaSemana)
    const ini = String((v as VentanaInput).horaInicio ?? '')
    const fin = String((v as VentanaInput).horaFin ?? '')
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue
    if (!HHMM.test(ini) || !HHMM.test(fin) || toMin(ini) >= toMin(fin)) continue
    out.push({ diaSemana: dia, horaInicio: ini, horaFin: fin })
  }
  return out
}

// ── CRUD de links (admin) ─────────────────────────────────────────────────────

export async function listarLinks(db: TenantClient) {
  const links = await db.linkAgenda.findMany({ include: LINK_INCLUDE, orderBy: { createdAt: 'desc' } })
  const conteos = await db.cita.groupBy({ by: ['linkAgendaId'], where: { origen: 'ONLINE' }, _count: { _all: true } })
  const map = new Map(conteos.map((c) => [c.linkAgendaId, c._count._all]))
  return links.map((l) => ({ ...l, reservas: map.get(l.id) ?? 0 }))
}

export interface CrearLinkInput {
  nombre: string; descripcion?: string | null; doctorId?: string; profesionales?: string[]; tipoCita?: string; duracionMin?: number
  usaHorarioDoctor?: boolean; anticipacionHoras?: number; diasMaxFuturo?: number
  mensajeConfirmacion?: string | null; color?: string | null; ventanas?: unknown
}

// Valida que los profesionales existan y estén activos; devuelve la lista de ids
// (al menos uno). Acepta `profesionales[]` o, por compatibilidad, `doctorId`.
async function validarProfesionales(db: TenantClient, input: { profesionales?: string[]; doctorId?: string }): Promise<string[]> {
  const ids = [...new Set((input.profesionales && input.profesionales.length ? input.profesionales : (input.doctorId ? [input.doctorId] : [])).filter(Boolean))]
  if (ids.length === 0) throw badRequest('Selecciona al menos un profesional')
  const activos = await db.user.findMany({ where: { id: { in: ids }, activo: true }, select: { id: true } })
  if (activos.length !== ids.length) throw badRequest('Hay profesionales inválidos en la selección')
  return ids
}

export async function crearLink(db: TenantClient, input: CrearLinkInput) {
  const nombre = (input.nombre ?? '').trim()
  if (!nombre) throw badRequest('Falta el nombre del link')
  const ids = await validarProfesionales(db, input)
  const duracionMin = Number(input.duracionMin) || 30
  if (duracionMin < 5 || duracionMin > 480) throw badRequest('Duración inválida (5 a 480 minutos)')
  const usaHorarioDoctor = input.usaHorarioDoctor !== false
  const ventanas = usaHorarioDoctor ? [] : normalizarVentanas(input.ventanas)
  if (!usaHorarioDoctor && ventanas.length === 0) throw badRequest('Define al menos una ventana horaria, o usa el horario del profesional.')

  let tk = token()
  while (await db.linkAgenda.findUnique({ where: { token: tk }, select: { id: true } })) tk = token()

  return db.linkAgenda.create({
    data: {
      token: tk, nombre, descripcion: input.descripcion?.trim() || null, doctorId: ids[0],
      tipoCita: (input.tipoCita || 'EVALUACION').trim().toUpperCase(), duracionMin, usaHorarioDoctor,
      anticipacionHoras: clampInt(input.anticipacionHoras, 0, 720, 12),
      diasMaxFuturo: clampInt(input.diasMaxFuturo, 1, 365, 30),
      mensajeConfirmacion: input.mensajeConfirmacion?.trim() || null, color: input.color || null,
      ventanas: { create: ventanas },
      profesionales: { create: ids.map((userId) => ({ userId })) },
    },
    include: LINK_INCLUDE,
  })
}

export async function actualizarLink(db: TenantClient, id: string, body: Record<string, unknown>) {
  const existing = await db.linkAgenda.findUnique({ where: { id }, select: { id: true, usaHorarioDoctor: true } })
  if (!existing) throw notFound('Link no encontrado')
  const data: Record<string, unknown> = {}
  if (typeof body.nombre === 'string') { const n = body.nombre.trim(); if (!n) throw badRequest('El nombre no puede quedar vacío'); data.nombre = n }
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion).trim() : null
  if (typeof body.tipoCita === 'string') data.tipoCita = body.tipoCita.trim().toUpperCase()
  if (body.duracionMin !== undefined) { const d = Number(body.duracionMin); if (!(d >= 5 && d <= 480)) throw badRequest('Duración inválida'); data.duracionMin = d }
  if (body.usaHorarioDoctor !== undefined) data.usaHorarioDoctor = Boolean(body.usaHorarioDoctor)
  if (body.anticipacionHoras !== undefined) data.anticipacionHoras = clampInt(body.anticipacionHoras, 0, 720, 12)
  if (body.diasMaxFuturo !== undefined) data.diasMaxFuturo = clampInt(body.diasMaxFuturo, 1, 365, 30)
  if (body.mensajeConfirmacion !== undefined) data.mensajeConfirmacion = body.mensajeConfirmacion ? String(body.mensajeConfirmacion).trim() : null
  if (body.color !== undefined) data.color = body.color ? String(body.color) : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  let nuevosProfes: string[] | null = null
  if (Array.isArray(body.profesionales)) {
    nuevosProfes = await validarProfesionales(db, { profesionales: body.profesionales as string[] })
    data.doctorId = nuevosProfes[0]
  } else if (typeof body.doctorId === 'string') {
    nuevosProfes = await validarProfesionales(db, { doctorId: body.doctorId })
    data.doctorId = nuevosProfes[0]
  }

  const reemplazaVentanas = body.ventanas !== undefined
  const usaHorario = data.usaHorarioDoctor !== undefined ? Boolean(data.usaHorarioDoctor) : existing.usaHorarioDoctor

  return db.$transaction(async (tx) => {
    await tx.linkAgenda.update({ where: { id }, data })
    if (nuevosProfes) {
      await tx.linkAgendaProfesional.deleteMany({ where: { linkId: id } })
      await tx.linkAgendaProfesional.createMany({ data: nuevosProfes.map((userId) => ({ linkId: id, userId })) })
    }
    if (reemplazaVentanas) {
      await tx.linkAgendaVentana.deleteMany({ where: { linkId: id } })
      if (!usaHorario) {
        const ventanas = normalizarVentanas(body.ventanas)
        if (ventanas.length > 0) await tx.linkAgendaVentana.createMany({ data: ventanas.map((v) => ({ ...v, linkId: id })) })
      }
    }
    return tx.linkAgenda.findUnique({ where: { id }, include: LINK_INCLUDE })
  })
}

export async function eliminarLink(db: TenantClient, id: string) {
  const existing = await db.linkAgenda.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw notFound('Link no encontrado')
  // Las citas ya creadas conservan su referencia (linkAgendaId queda colgando, sin FK).
  await db.linkAgenda.delete({ where: { id } })
}

// ── Reservas online (admin) ───────────────────────────────────────────────────

export async function listarReservas(db: TenantClient, opts?: { linkId?: string }) {
  return db.cita.findMany({
    where: { origen: 'ONLINE', ...(opts?.linkId ? { linkAgendaId: opts.linkId } : {}) },
    select: {
      id: true, fecha: true, duracion: true, estado: true, tipo: true, notas: true, linkAgendaId: true, createdAt: true,
      paciente: { select: { id: true, nombre: true, apellido: true, telefono: true, rut: true } },
      doctor: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}

// ── Disponibilidad (slots) ────────────────────────────────────────────────────

type Link = NonNullable<Awaited<ReturnType<typeof obtenerLinkPorToken>>>

async function busyIntervals(db: TenantClient, doctorId: string, from: Date, to: Date) {
  const [citas, bloqueos] = await Promise.all([
    db.cita.findMany({
      where: { doctorId, estado: { notIn: ESTADOS_NO_OCUPAN }, fecha: { gte: new Date(from.getTime() - 24 * 3600_000), lt: to } },
      select: { fecha: true, duracion: true },
    }),
    db.bloqueoAgenda.findMany({ where: { doctorId, inicio: { lt: to }, fin: { gt: from } }, select: { inicio: true, fin: true } }),
  ])
  const out: [Date, Date][] = []
  for (const c of citas) out.push([c.fecha, addMinutes(c.fecha, c.duracion)])
  for (const b of bloqueos) out.push([b.inicio, b.fin])
  return out
}

// Ventanas (HH:MM) de un día de la semana, según el link (horario del profesional
// con receso partido, o las ventanas propias del link).
function ventanasDelDia(link: Link, horarios: Awaited<ReturnType<typeof listarHorarios>>, weekday: number): { ini: string; fin: string }[] {
  if (link.usaHorarioDoctor) {
    const out: { ini: string; fin: string }[] = []
    for (const h of horarios) {
      if (h.diaSemana !== weekday || !h.activo) continue
      if (h.recesoActivo && h.recesoInicio && h.recesoFin && h.recesoInicio < h.recesoFin) {
        out.push({ ini: h.horaInicio, fin: h.recesoInicio }, { ini: h.recesoFin, fin: h.horaFin })
      } else {
        out.push({ ini: h.horaInicio, fin: h.horaFin })
      }
    }
    return out
  }
  return link.ventanas.filter((v) => v.diaSemana === weekday).map((v) => ({ ini: v.horaInicio, fin: v.horaFin }))
}

export async function calcularSlots(db: TenantClient, link: Link, doctorId: string, now = new Date()) {
  const minInicio = new Date(now.getTime() + link.anticipacionHoras * 3600_000)
  const horarios = link.usaHorarioDoctor ? await listarHorarios(db, doctorId) : []
  const startYmd = todayYmd(undefined, now)
  const finRango = new Date(now.getTime() + (link.diasMaxFuturo + 1) * 86400_000)
  const busy = await busyIntervals(db, doctorId, minInicio, finRango)

  const dias: { dia: string; slots: { inicio: string; hora: string }[] }[] = []
  for (let i = 0; i <= link.diasMaxFuturo; i++) {
    const ymd = addDaysYmd(startYmd, i)
    const ventanas = ventanasDelDia(link, horarios, weekdayOfYmd(ymd))
    if (ventanas.length === 0) continue
    const slots: { inicio: string; hora: string }[] = []
    for (const w of ventanas) {
      const wStart = toMin(w.ini), wEnd = toMin(w.fin)
      for (let m = wStart; m + link.duracionMin <= wEnd; m += link.duracionMin) {
        const hm = fromMin(m)
        const inicio = wallClockToUtc(ymd, hm)
        if (inicio.getTime() < minInicio.getTime()) continue
        const fin = new Date(inicio.getTime() + link.duracionMin * 60000)
        if (busy.some(([bi, bf]) => intervalsOverlap(bi, bf, inicio, fin))) continue
        slots.push({ inicio: inicio.toISOString(), hora: hm })
      }
    }
    if (slots.length > 0) dias.push({ dia: ymd, slots })
  }
  return dias
}

// ── Acceso público (por token) ────────────────────────────────────────────────

export async function obtenerLinkPorToken(db: TenantClient, tk: string) {
  return db.linkAgenda.findFirst({ where: { token: tk, activo: true }, include: LINK_INCLUDE })
}

export interface ReservarInput {
  inicio: string; doctorId?: string; nombre: string; apellido: string; telefono: string; email?: string; rut?: string; motivo?: string
  eventId?: string
  campana?: string; externalId?: string
  utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string
  fbclid?: string; ctwaClid?: string; gclid?: string; msclkid?: string; ttclid?: string; twclid?: string; liFatId?: string; igclid?: string; dclid?: string
  fbp?: string; fbc?: string; referrer?: string; landing?: string; tituloPagina?: string; pantalla?: string; locale?: string
}

export async function reservarPublico(db: TenantClient, link: Link, input: ReservarInput) {
  const nombre = (input.nombre ?? '').trim()
  const apellido = (input.apellido ?? '').trim()
  const telefono = (input.telefono ?? '').trim()
  if (!nombre || !apellido) throw badRequest('Ingresa tu nombre y apellido.')
  if (telefono.replace(/\D/g, '').length < 8) throw badRequest('Ingresa un teléfono válido para confirmar tu hora.')

  // Profesional elegido: debe ser uno de los del link (si no se indica y hay uno solo, ese).
  const profes = profesionalesIds(link)
  const doctorId = input.doctorId && profes.includes(input.doctorId) ? input.doctorId : (profes.length === 1 ? profes[0] : '')
  if (!doctorId) throw badRequest('Selecciona un profesional para tu hora.')

  const inicio = new Date(input.inicio)
  if (Number.isNaN(inicio.getTime())) throw badRequest('Horario inválido.')

  // El horario elegido debe ser uno de los slots disponibles del profesional (revalidación server-side).
  const dias = await calcularSlots(db, link, doctorId)
  const disponible = dias.some((d) => d.slots.some((s) => s.inicio === inicio.toISOString()))
  if (!disponible) throw conflict('Ese horario ya no está disponible. Elige otro, por favor.')

  const fin = new Date(inicio.getTime() + link.duracionMin * 60000)

  // RUT opcional: si viene y es válido, lo usamos para no duplicar el paciente.
  let rut: string | null = null
  if (input.rut && validarRut(input.rut)) rut = formatRut(input.rut)

  // Buscar paciente existente por RUT o por teléfono; si no, crearlo (lead online).
  const soloDigitos = telefono.replace(/\D/g, '')
  let paciente = rut
    ? await db.paciente.findFirst({ where: { rut }, select: { id: true } })
    : null
  if (!paciente && soloDigitos) {
    const candidatos = await db.paciente.findMany({ where: { telefono: { not: null } }, select: { id: true, telefono: true } })
    const hit = candidatos.find((p) => (p.telefono ?? '').replace(/\D/g, '') === soloDigitos)
    if (hit) paciente = { id: hit.id }
  }
  if (!paciente) {
    const ultimo = await db.paciente.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true } })
    paciente = await db.paciente.create({
      data: {
        numero: Math.max(1000, (ultimo?.numero ?? 999) + 1),
        nombre, apellido, telefono, rut,
        email: input.email?.trim() || null, activo: true,
      },
      select: { id: true },
    })
  }

  // Revalidación atómica de conflicto (carrera entre dos reservas del mismo cupo).
  const bloqueo = await db.bloqueoAgenda.findFirst({ where: { doctorId, inicio: { lt: fin }, fin: { gt: inicio } }, select: { id: true } })
  if (bloqueo) throw conflict('Ese horario ya no está disponible.')
  const ocupada = await db.cita.findFirst({
    where: { doctorId, estado: { notIn: ESTADOS_NO_OCUPAN }, fecha: { lt: fin, gte: new Date(inicio.getTime() - 12 * 3600_000) } },
    select: { fecha: true, duracion: true },
  })
  if (ocupada && intervalsOverlap(ocupada.fecha, addMinutes(ocupada.fecha, ocupada.duracion), inicio, fin)) {
    throw conflict('Ese horario acaba de ser tomado. Elige otro, por favor.')
  }

  const motivo = input.motivo?.trim()
  const cita = await db.cita.create({
    data: {
      pacienteId: paciente.id, doctorId, fecha: inicio, duracion: link.duracionMin,
      tipo: link.tipoCita, estado: 'PENDIENTE', origen: 'ONLINE', linkAgendaId: link.id,
      notas: motivo || `Reserva online · ${link.nombre}`,
      logs: { create: { tipo: 'AGENDADA', detalle: `Reserva online (${link.nombre})`, userName: `${nombre} ${apellido}` } },
    },
    select: { id: true, fecha: true, duracion: true },
  })

  // CRM: registrar la reserva como lead (origen agenda online) + evento Schedule a
  // Meta (best-effort; nunca hace fallar la reserva).
  try {
    const eventId = input.eventId?.trim() || randomUUID() // dedup con el Pixel del navegador
    const cfg = await getMetaConfig(db)
    const t = (v?: string) => (v && v.trim() ? v.trim() : null)
    const enviado = metaHabilitado(cfg)
    const lead = await db.lead.create({
      data: {
        nombre, apellido, telefono, email: input.email?.trim() || null, rut, motivo: motivo || null,
        origen: 'AGENDA_ONLINE', estado: 'AGENDADO', pacienteId: paciente.id, citaId: cita.id,
        fechaAgenda: cita.fecha, agendaFuente: link.nombre,
        externalId: t(input.externalId), campana: t(input.campana),
        utmSource: t(input.utmSource), utmMedium: t(input.utmMedium), utmCampaign: t(input.utmCampaign),
        utmContent: t(input.utmContent), utmTerm: t(input.utmTerm),
        fbclid: t(input.fbclid), ctwaClid: t(input.ctwaClid), gclid: t(input.gclid), msclkid: t(input.msclkid),
        ttclid: t(input.ttclid), twclid: t(input.twclid), liFatId: t(input.liFatId), igclid: t(input.igclid), dclid: t(input.dclid),
        fbp: t(input.fbp), fbc: t(input.fbc), referrer: t(input.referrer), landing: t(input.landing),
        tituloPagina: t(input.tituloPagina), pantalla: t(input.pantalla), locale: t(input.locale),
        scheduleEventId: eventId, scheduleCapiEnviado: enviado, metaEnviado: enviado,
        notas: { create: { tipo: 'SISTEMA', texto: `Reserva online · ${link.nombre}` } },
      },
    })
    const externalId = lead.externalId || rut || lead.id
    if (enviado) {
      void enviarEventoMeta(cfg, {
        eventName: 'Schedule', eventId, email: input.email, telefono, nombre, apellido,
        externalId, ctwaClid: t(input.ctwaClid), pais: 'cl',
        fbp: input.fbp, fbc: input.fbc, custom: { content_name: link.tipoCita },
      })
    }
  } catch { /* best-effort */ }

  const profe = link.profesionales.find((p) => p.userId === doctorId)?.user
  return {
    ok: true,
    citaId: cita.id,
    inicio: cita.fecha.toISOString(),
    duracionMin: cita.duracion,
    profesional: profe?.name ?? profe?.email ?? link.doctor.name ?? link.doctor.email,
    mensaje: link.mensajeConfirmacion || null,
  }
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.round(n)))
}
