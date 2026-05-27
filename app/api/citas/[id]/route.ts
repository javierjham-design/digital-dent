import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const ESTADOS = ['PENDIENTE', 'CONFIRMADA', 'ATENDIDA', 'CANCELADA', 'NO_ASISTIO']

const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE:  'Pendiente',
  CONFIRMADA: 'Confirmada',
  ATENDIDA:   'Atendida',
  CANCELADA:  'Cancelada',
  NO_ASISTIO: 'No asistió',
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body     = await req.json()
  const userName = u.name ?? u.email ?? 'Sistema'

  const current = await prisma.cita.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { estado: true, confirmadoWA: true },
  })
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) {
      return NextResponse.json({ error: `estado inválido. Use: ${ESTADOS.join(', ')}` }, { status: 400 })
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

  const logEntries: { tipo: string; detalle: string; userName: string }[] = []
  if (data.estado && data.estado !== current.estado) {
    const from = ESTADO_LABELS[current.estado ?? ''] ?? current.estado ?? '—'
    const to   = ESTADO_LABELS[data.estado as string] ?? (data.estado as string)
    logEntries.push({ tipo: 'ESTADO', detalle: `Estado cambiado de "${from}" a "${to}"`, userName })
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
  return NextResponse.json(cita)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.cita.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.cita.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
