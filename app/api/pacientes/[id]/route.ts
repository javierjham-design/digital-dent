import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const paciente = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId } })
  if (!paciente) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(paciente)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const paciente = await prisma.paciente.update({ where: { id }, data: body })
  return NextResponse.json(paciente)
}
