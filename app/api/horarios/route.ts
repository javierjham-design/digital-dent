import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const doctorId = req.nextUrl.searchParams.get('doctorId')
  const horarios = await prisma.horarioDoctor.findMany({
    where: doctorId ? { doctorId } : {},
    orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
  })
  return NextResponse.json(horarios)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { doctorId, days } = await req.json()
  const results = await Promise.all(
    (days as { diaSemana: number; horaInicio: string; horaFin: string; activo: boolean }[]).map((day) =>
      prisma.horarioDoctor.upsert({
        where: { doctorId_diaSemana: { doctorId, diaSemana: day.diaSemana } },
        update: { horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo },
        create: { doctorId, diaSemana: day.diaSemana, horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo },
      })
    )
  )
  return NextResponse.json(results)
}
