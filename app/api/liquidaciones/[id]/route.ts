import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const liquidacion = await prisma.liquidacion.findUnique({
    where: { id },
    include: {
      doctor: { select: { id: true, name: true, email: true, rut: true, especialidad: true } },
      contrato: true,
      items: { orderBy: { fechaCompletado: 'asc' } },
    },
  })
  if (!liquidacion) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(liquidacion)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (body.fechaPago) body.fechaPago = new Date(body.fechaPago)
  const liquidacion = await prisma.liquidacion.update({ where: { id }, data: body })
  return NextResponse.json(liquidacion)
}
