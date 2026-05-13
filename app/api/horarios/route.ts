import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const doctorId = req.nextUrl.searchParams.get('doctorId')
  const horarios = await prisma.horarioDoctor.findMany({
    where: { clinicaId: u.clinicaId, ...(doctorId ? { doctorId } : {}) },
    orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
  })
  return NextResponse.json(horarios)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { doctorId, days } = await req.json()

  const doctor = await prisma.user.findFirst({ where: { id: doctorId, clinicaId: u.clinicaId }, select: { id: true } })
  if (!doctor) return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 })

  const results = await Promise.all(
    (days as { diaSemana: number; horaInicio: string; horaFin: string; activo: boolean }[]).map((day) =>
      prisma.horarioDoctor.upsert({
        where: { doctorId_diaSemana: { doctorId, diaSemana: day.diaSemana } },
        update: { horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo, clinicaId: u.clinicaId },
        create: { clinicaId: u.clinicaId, doctorId, diaSemana: day.diaSemana, horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo },
      })
    )
  )
  return NextResponse.json(results)
}
