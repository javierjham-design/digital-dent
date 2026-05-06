import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const citas = await prisma.cita.findMany({
    where: {
      ...(from && to ? { fecha: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    include: { paciente: true, doctor: true },
    orderBy: { fecha: 'asc' },
  })
  return NextResponse.json(citas)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const cita = await prisma.cita.create({
    data: {
      pacienteId: body.pacienteId,
      doctorId: body.doctorId,
      fecha: new Date(body.fecha),
      duracion: Number(body.duracion) || 30,
      tipo: body.tipo || 'CONSULTA',
      notas: body.notas || null,
      sala: body.sala || null,
    },
  })
  return NextResponse.json(cita, { status: 201 })
}
