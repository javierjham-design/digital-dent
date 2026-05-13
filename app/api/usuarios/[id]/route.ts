import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.user.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (body.password) body.password = await bcrypt.hash(body.password, 10)

  // Bloquear cambios sensibles si no es admin
  if (u.role !== 'admin' && u.id !== id) {
    return NextResponse.json({ error: 'Solo admin puede editar a otros usuarios' }, { status: 403 })
  }

  const usuario = await prisma.user.update({
    where: { id },
    data: body,
    select: { id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, puedeRecibirPagos: true, createdAt: true },
  })
  return NextResponse.json(usuario)
}
