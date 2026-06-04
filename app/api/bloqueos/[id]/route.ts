import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Editar o eliminar un bloqueo. Mismas reglas que crear: admin puede tocar
// cualquiera de la clínica; un doctor solo los suyos.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.bloqueoAgenda.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { id: true, doctorId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = u.role === 'admin'
  if (!isAdmin && existing.doctorId !== u.id) {
    return NextResponse.json({ error: 'No puedes editar bloqueos de otros usuarios.' }, { status: 403 })
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.inicio !== undefined) {
    const inicio = new Date(body.inicio)
    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ error: 'Fecha de inicio inválida.' }, { status: 400 })
    }
    data.inicio = inicio
  }
  if (body.fin !== undefined) {
    const fin = new Date(body.fin)
    if (Number.isNaN(fin.getTime())) {
      return NextResponse.json({ error: 'Fecha de fin inválida.' }, { status: 400 })
    }
    data.fin = fin
  }
  if (body.motivo !== undefined) {
    data.motivo = typeof body.motivo === 'string' && body.motivo.trim() ? body.motivo.trim() : null
  }

  const bloqueo = await prisma.bloqueoAgenda.update({
    where: { id },
    data,
    include: { doctor: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json(bloqueo)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.bloqueoAgenda.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { id: true, doctorId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = u.role === 'admin'
  if (!isAdmin && existing.doctorId !== u.id) {
    return NextResponse.json({ error: 'No puedes eliminar bloqueos de otros usuarios.' }, { status: 403 })
  }

  await prisma.bloqueoAgenda.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
