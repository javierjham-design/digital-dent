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

  const mensajes = await prisma.mensajePaciente.findMany({
    where: { pacienteId: id, clinicaId: u.clinicaId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json(mensajes)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const paciente = await prisma.paciente.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!paciente) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  if (!body.tipo || !body.categoria) {
    return NextResponse.json({ error: 'tipo y categoria son requeridos' }, { status: 400 })
  }

  const m = await prisma.mensajePaciente.create({
    data: {
      clinicaId: u.clinicaId,
      pacienteId: id,
      citaId: body.citaId ?? null,
      tipo: body.tipo,
      categoria: body.categoria,
      asunto: body.asunto ?? null,
      cuerpo: body.cuerpo ?? null,
      enviadoA: body.enviadoA ?? null,
      estado: body.estado ?? 'ENVIADO',
    },
  })
  return NextResponse.json(m, { status: 201 })
}
