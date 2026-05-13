import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const paciente = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!paciente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comentarios = await prisma.comentarioAdministrativo.findMany({
    where: { pacienteId: id, clinicaId: u.clinicaId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(comentarios)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const paciente = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!paciente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (!body.texto || !String(body.texto).trim()) {
    return NextResponse.json({ error: 'Texto requerido' }, { status: 400 })
  }

  const c = await prisma.comentarioAdministrativo.create({
    data: {
      clinicaId: u.clinicaId,
      pacienteId: id,
      autorNombre: u.name ?? u.email,
      autorId: u.id,
      texto: String(body.texto).trim(),
    },
  })
  return NextResponse.json(c, { status: 201 })
}
