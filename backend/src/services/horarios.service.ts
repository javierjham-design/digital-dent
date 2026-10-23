import type { TenantClient } from '@/db/tenant'
import { badRequest, forbidden, notFound } from '@/lib/errors'
import type { JwtPayload } from '@/services/auth.service'
import type { HorarioDTO } from '@shared/types'

const ROLES_CON_AGENDA = ['doctor', 'medico']

// Mismo criterio que bloqueos: admin o gestor de agenda toca cualquier horario;
// el resto, solo el propio (el horario define cupos de la reserva pública y TuBot).
async function puedeGestionarAgenda(db: TenantClient, actor: JwtPayload): Promise<boolean> {
  if (actor.role === 'admin' || actor.isPlatformAdmin) return true
  const u = await db.user.findUnique({ where: { id: actor.sub }, select: { puedeGestionarAgenda: true } })
  return Boolean(u?.puedeGestionarAgenda)
}

function toDTO(h: {
  id: string; doctorId: string; diaSemana: number; horaInicio: string; horaFin: string; activo: boolean
  recesoActivo: boolean; recesoInicio: string | null; recesoFin: string | null
  sobrecupoActivo: boolean; sobrecupoInicio: string | null; sobrecupoFin: string | null
}): HorarioDTO {
  return h
}

export async function listarHorarios(db: TenantClient, doctorId?: string): Promise<HorarioDTO[]> {
  const horarios = await db.horarioDoctor.findMany({
    where: { ...(doctorId ? { doctorId } : {}) },
    orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
  })
  return horarios.map(toDTO)
}

export interface DiaHorarioInput {
  diaSemana: number; horaInicio: string; horaFin: string; activo: boolean
  recesoActivo?: boolean; recesoInicio?: string | null; recesoFin?: string | null
  sobrecupoActivo?: boolean; sobrecupoInicio?: string | null; sobrecupoFin?: string | null
}

export async function guardarHorarios(db: TenantClient, actor: JwtPayload, doctorId: string, days: DiaHorarioInput[]): Promise<HorarioDTO[]> {
  if (!doctorId) throw badRequest('Doctor requerido')
  if (!(await puedeGestionarAgenda(db, actor)) && doctorId !== actor.sub) {
    throw forbidden('Solo puedes modificar tu propio horario.')
  }
  const doctor = await db.user.findUnique({ where: { id: doctorId }, select: { id: true, role: true } })
  if (!doctor) throw notFound('Doctor no encontrado')
  if (!ROLES_CON_AGENDA.includes(doctor.role)) {
    throw badRequest('Este usuario no tiene perfil con agenda (solo Doctor/Médico).')
  }

  const results = await Promise.all(
    days.map((day) => {
      const recesoActivo = Boolean(day.recesoActivo)
      const sobrecupoActivo = Boolean(day.sobrecupoActivo)
      const campos = {
        horaInicio: day.horaInicio, horaFin: day.horaFin, activo: day.activo,
        recesoActivo, recesoInicio: recesoActivo ? day.recesoInicio || null : null, recesoFin: recesoActivo ? day.recesoFin || null : null,
        sobrecupoActivo, sobrecupoInicio: sobrecupoActivo ? day.sobrecupoInicio || day.horaInicio : null, sobrecupoFin: sobrecupoActivo ? day.sobrecupoFin || day.horaFin : null,
      }
      return db.horarioDoctor.upsert({
        where: { doctorId_diaSemana: { doctorId, diaSemana: day.diaSemana } },
        update: campos,
        create: { doctorId, diaSemana: day.diaSemana, ...campos },
      })
    }),
  )
  return results.map(toDTO)
}
