import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.contrato.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  if (body.porcentaje != null) body.porcentaje = Number(body.porcentaje)
  if (body.montoFijo != null) body.montoFijo = Number(body.montoFijo)
  if (body.fechaInicio) body.fechaInicio = new Date(body.fechaInicio)
  if (body.fechaFin) body.fechaFin = new Date(body.fechaFin)
  const contrato = await prisma.contrato.update({ where: { id }, data: body })
  return NextResponse.json(contrato)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.contrato.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.contrato.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
