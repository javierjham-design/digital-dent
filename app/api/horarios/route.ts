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

interface DayInput {
  diaSemana: number
  horaInicio: string
  horaFin: string
  activo: boolean
  recesoActivo?: boolean
  recesoInicio?: string | null
  recesoFin?: string | null
  sobrecupoActivo?: boolean
  sobrecupoInicio?: string | null
  sobrecupoFin?: string | null
}

const ROLES_CON_AGENDA = ['doctor', 'medico']

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { doctorId, days } = await req.json()

  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, clinicaId: u.clinicaId },
    select: { id: true, role: true },
  })
  if (!doctor) return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 })
  if (!ROLES_CON_AGENDA.includes(doctor.role)) {
    return NextResponse.json({ error: 'Este usuario no tiene perfil con agenda (solo Doctor/Médico).' }, { status: 400 })
  }

  const results = await Promise.all(
    (days as DayInput[]).map((day) => {
      const recesoActivo    = Boolean(day.recesoActivo)
      const recesoInicio    = recesoActivo ? (day.recesoInicio || null) : null
      const recesoFin       = recesoActivo ? (day.recesoFin    || null) : null
      const sobrecupoActivo = Boolean(day.sobrecupoActivo)
      const sobrecupoInicio = sobrecupoActivo ? (day.sobrecupoInicio || day.horaInicio) : null
      const sobrecupoFin    = sobrecupoActivo ? (day.sobrecupoFin    || day.horaFin)    : null
      return prisma.horarioDoctor.upsert({
        where: { doctorId_diaSemana: { doctorId, diaSemana: day.diaSemana } },
        update: {
          horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo,
          recesoActivo, recesoInicio, recesoFin,
          sobrecupoActivo, sobrecupoInicio, sobrecupoFin,
          clinicaId: u.clinicaId,
        },
        create: {
          clinicaId: u.clinicaId, doctorId, diaSemana: day.diaSemana,
          horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo,
          recesoActivo, recesoInicio, recesoFin,
          sobrecupoActivo, sobrecupoInicio, sobrecupoFin,
        },
      })
    })
  )
  return NextResponse.json(results)
}
