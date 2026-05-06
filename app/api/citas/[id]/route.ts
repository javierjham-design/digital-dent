import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE:  'Pendiente',
  CONFIRMADA: 'Confirmada',
  ATENDIDA:   'Atendida',
  CANCELADA:  'Cancelada',
  NO_ASISTIO: 'No asistió',
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body     = await req.json()
  const userName = (session.user as any)?.name ?? session.user?.email ?? 'Sistema'

  // Read current state before update
  const current = await prisma.cita.findUnique({ where: { id }, select: { estado: true, confirmadoWA: true } })

  // Build log entries for this patch
  const logEntries: { tipo: string; detalle: string; userName: string }[] = []

  if (body.estado && body.estado !== current?.estado) {
    const from = ESTADO_LABELS[current?.estado ?? ''] ?? current?.estado ?? '—'
    const to   = ESTADO_LABELS[body.estado] ?? body.estado
    logEntries.push({ tipo: 'ESTADO', detalle: `Estado cambiado de "${from}" a "${to}"`, userName })
  }

  if (body.confirmadoWA === true && !current?.confirmadoWA) {
    logEntries.push({ tipo: 'WA_ENVIADO', detalle: 'Confirmación enviada por WhatsApp', userName })
  }

  const cita = await prisma.cita.update({
    where: { id },
    data: {
      ...body,
      ...(logEntries.length > 0 ? { logs: { create: logEntries } } : {}),
    },
  })
  return NextResponse.json(cita)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.cita.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
