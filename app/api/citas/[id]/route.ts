import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { deleteCitaInGoogle, pushCita } from '@/lib/google-sync'
import { CITA_ESTADOS_KEYS, CITA_ESTADO_LABELS } from '@/lib/cita-estados'
import { findCitaSolapada, mensajeSolape } from '@/lib/citas'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body     = await req.json()
  const userName = u.name ?? u.email ?? 'Sistema'

  const current = await prisma.cita.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { estado: true, confirmadoWA: true, fecha: true, duracion: true, doctorId: true, sobrecupo: true },
  })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.estado !== undefined) {
    if (!CITA_ESTADOS_KEYS.includes(body.estado)) {
      return NextResponse.json({ error: `estado inválido. Use: ${CITA_ESTADOS_KEYS.join(', ')}` }, { status: 400 })
    }
    data.estado = body.estado
  }
  if (body.fecha !== undefined) data.fecha = new Date(body.fecha)
  if (body.duracion !== undefined) {
    const n = Number(body.duracion)
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'duracion inválida' }, { status: 400 })
    data.duracion = n
  }
  if (body.tipo !== undefined) data.tipo = body.tipo ? String(body.tipo) : null
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.sala !== undefined) data.sala = body.sala ? String(body.sala) : null
  if (body.confirmadoWA !== undefined) data.confirmadoWA = Boolean(body.confirmadoWA)
  if (body.sobrecupo !== undefined) data.sobrecupo = Boolean(body.sobrecupo)

  // Si cambia doctor, validar que pertenezca a la clínica.
  if (body.doctorId !== undefined) {
    const doctor = await prisma.user.findFirst({
      where: { id: body.doctorId, clinicaId: u.clinicaId, activo: true },
      select: { id: true },
    })
    if (!doctor) return NextResponse.json({ error: 'Doctor no existe en esta clínica' }, { status: 400 })
    data.doctorId = body.doctorId
  }

  // Si cambia el horario (reagendado) o el doctor, validar que el nuevo rango
  // no choque con otra cita activa ni con un bloqueo del doctor.
  const cambiaHorario = data.fecha !== undefined || data.duracion !== undefined || data.doctorId !== undefined
  if (cambiaHorario) {
    const nuevaFecha    = (data.fecha as Date) ?? current.fecha
    const nuevaDuracion = (data.duracion as number) ?? current.duracion
    const nuevoDoctorId = (data.doctorId as string) ?? current.doctorId
    const esSobrecupo   = data.sobrecupo !== undefined ? (data.sobrecupo as boolean) : current.sobrecupo
    const nuevoFin = new Date(nuevaFecha.getTime() + nuevaDuracion * 60000)

    const bloqueo = await prisma.bloqueoAgenda.findFirst({
      where: {
        clinicaId: u.clinicaId,
        doctorId: nuevoDoctorId,
        inicio: { lt: nuevoFin },
        fin: { gt: nuevaFecha },
      },
      select: { motivo: true },
    })
    if (bloqueo) {
      return NextResponse.json({
        error: `El doctor tiene un bloqueo de agenda en ese horario${bloqueo.motivo ? ` (${bloqueo.motivo})` : ''}.`,
      }, { status: 409 })
    }

    if (!esSobrecupo) {
      const solapada = await findCitaSolapada({
        clinicaId: u.clinicaId,
        doctorId: nuevoDoctorId,
        inicio: nuevaFecha,
        fin: nuevoFin,
        excluirCitaId: id,
      })
      if (solapada) {
        return NextResponse.json({ error: mensajeSolape(solapada) }, { status: 409 })
      }
    }
  }

  const logEntries: { tipo: string; detalle: string; userName: string }[] = []
  if (data.estado && data.estado !== current.estado) {
    const from = CITA_ESTADO_LABELS[current.estado ?? ''] ?? current.estado ?? '—'
    const to   = CITA_ESTADO_LABELS[data.estado as string] ?? (data.estado as string)
    logEntries.push({ tipo: 'ESTADO', detalle: `Estado cambiado de "${from}" a "${to}"`, userName })
  }
  if (data.fecha !== undefined && (data.fecha as Date).getTime() !== current.fecha.getTime()) {
    const fmt = (d: Date) =>
      d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    logEntries.push({
      tipo: 'ESTADO',
      detalle: `Reagendada de ${fmt(current.fecha)} a ${fmt(data.fecha as Date)}`,
      userName,
    })
  }
  if (data.confirmadoWA === true && !current.confirmadoWA) {
    logEntries.push({ tipo: 'WA_ENVIADO', detalle: 'Confirmación enviada por WhatsApp', userName })
  }

  const cita = await prisma.cita.update({
    where: { id },
    data: {
      ...data,
      ...(logEntries.length > 0 ? { logs: { create: logEntries } } : {}),
    },
  })

  // Sincronizar con Google: si pasó a CANCELADA borramos el evento; si no
  // hacemos push para reflejar el cambio.
  if (data.estado === 'CANCELADA') {
    deleteCitaInGoogle(cita.id).catch(() => {})
  } else {
    pushCita(cita.id).catch(() => {})
  }

  return NextResponse.json(cita)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.cita.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // Borrar primero en Google (mientras todavía tenemos el googleEventId).
  await deleteCitaInGoogle(id)
  await prisma.cita.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
