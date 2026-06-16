import { prisma } from '@/lib/prisma'
import { badRequest, notFound } from '@/lib/errors'
import type { HorarioDTO } from '@shared/types'

const ROLES_CON_AGENDA = ['doctor', 'medico']

function toDTO(h: {
  id: string; doctorId: string; diaSemana: number; horaInicio: string; horaFin: string; activo: boolean
  recesoActivo: boolean; recesoInicio: string | null; recesoFin: string | null
  sobrecupoActivo: boolean; sobrecupoInicio: string | null; sobrecupoFin: string | null
}): HorarioDTO {
  return h
}

export async function listarHorarios(clinicaId: string, doctorId?: string): Promise<HorarioDTO[]> {
  const horarios = await prisma.horarioDoctor.findMany({
    where: { clinicaId, ...(doctorId ? { doctorId } : {}) },
    orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
  })
  return horarios.map(toDTO)
}

export interface DiaHorarioInput {
  diaSemana: number; horaInicio: string; horaFin: string; activo: boolean
  recesoActivo?: boolean; recesoInicio?: string | null; recesoFin?: string | null
  sobrecupoActivo?: boolean; sobrecupoInicio?: string | null; sobrecupoFin?: string | null
}

export async function guardarHorarios(clinicaId: string, doctorId: string, days: DiaHorarioInput[]): Promise<HorarioDTO[]> {
  if (!doctorId) throw badRequest('Doctor requerido')
  const doctor = await prisma.user.findFirst({ where: { id: doctorId, clinicaId }, select: { id: true, role: true } })
  if (!doctor) throw notFound('Doctor no encontrado')
  if (!ROLES_CON_AGENDA.includes(doctor.role)) {
    throw badRequest('Este usuario no tiene perfil con agenda (solo Doctor/Médico).')
  }

  const results = await Promise.all(
    days.map((day) => {
      const recesoActivo = Boolean(day.recesoActivo)
      const sobrecupoActivo = Boolean(day.sobrecupoActivo)
      return prisma.horarioDoctor.upsert({
        where: { doctorId_diaSemana: { doctorId, diaSemana: day.diaSemana } },
        update: {
          horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo,
          recesoActivo, recesoInicio: recesoActivo ? day.recesoInicio || null : null, recesoFin: recesoActivo ? day.recesoFin || null : null,
          sobrecupoActivo, sobrecupoInicio: sobrecupoActivo ? day.sobrecupoInicio || day.horaInicio : null, sobrecupoFin: sobrecupoActivo ? day.sobrecupoFin || day.horaFin : null,
          clinicaId,
        },
        create: {
          clinicaId, doctorId, diaSemana: day.diaSemana,
          horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo,
          recesoActivo, recesoInicio: recesoActivo ? day.recesoInicio || null : null, recesoFin: recesoActivo ? day.recesoFin || null : null,
          sobrecupoActivo, sobrecupoInicio: sobrecupoActivo ? day.sobrecupoInicio || day.horaInicio : null, sobrecupoFin: sobrecupoActivo ? day.sobrecupoFin || day.horaFin : null,
        },
      })
    }),
  )
  return results.map(toDTO)
}
