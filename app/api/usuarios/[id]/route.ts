import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (body.password) body.password = await bcrypt.hash(body.password, 10)
  const usuario = await prisma.user.update({
    where: { id },
    data: body,
    select: { id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, puedeRecibirPagos: true, createdAt: true },
  })
  return NextResponse.json(usuario)
}
