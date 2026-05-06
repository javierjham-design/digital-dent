import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  if (body.porcentaje != null) body.porcentaje = Number(body.porcentaje)
  if (body.montoFijo != null) body.montoFijo = Number(body.montoFijo)
  if (body.fechaInicio) body.fechaInicio = new Date(body.fechaInicio)
  if (body.fechaFin) body.fechaFin = new Date(body.fechaFin)
  const contrato = await prisma.contrato.update({ where: { id }, data: body })
  return NextResponse.json(contrato)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.contrato.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
