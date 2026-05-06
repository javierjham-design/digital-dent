import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.nombre   !== undefined) data.nombre   = body.nombre
  if (body.comision !== undefined) data.comision  = Number(body.comision)
  if (body.activo   !== undefined) data.activo    = body.activo
  const medio = await prisma.medioPago.update({ where: { id }, data })
  return NextResponse.json(medio)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await prisma.medioPago.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
