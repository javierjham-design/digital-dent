import { prisma } from '@/lib/prisma'
import { ESTADOS_NO_OCUPAN } from '@/lib/cita-estados'

/**
 * Busca una cita del doctor que se solape con [inicio, fin).
 * Las citas sobrecupo no participan (la agenda paralela permite solaparse),
 * y los estados CANCELADA / NO_ASISTIO liberan el horario.
 */
export async function findCitaSolapada(opts: {
  clinicaId: string
  doctorId: string
  inicio: Date
  fin: Date
  excluirCitaId?: string
}) {
  // Una cita existente [f, f+dur) se solapa si: f < fin AND f+dur > inicio.
  // Prisma no puede computar f+dur en el WHERE, así que traemos las citas del
  // doctor en una ventana de 24h antes del fin (ninguna cita dura más que eso)
  // y resolvemos el solape en JS.
  const ventanaDesde = new Date(opts.inicio.getTime() - 24 * 60 * 60 * 1000)
  const candidatas = await prisma.cita.findMany({
    where: {
      clinicaId: opts.clinicaId,
      doctorId: opts.doctorId,
      sobrecupo: false,
      estado: { notIn: ESTADOS_NO_OCUPAN },
      fecha: { gte: ventanaDesde, lt: opts.fin },
      ...(opts.excluirCitaId ? { id: { not: opts.excluirCitaId } } : {}),
    },
    select: {
      id: true,
      fecha: true,
      duracion: true,
      paciente: { select: { nombre: true, apellido: true } },
    },
  })
  return candidatas.find((c) => {
    const cFin = new Date(c.fecha.getTime() + c.duracion * 60000)
    return c.fecha < opts.fin && cFin > opts.inicio
  }) ?? null
}

export function mensajeSolape(c: {
  fecha: Date
  duracion: number
  paciente: { nombre: string; apellido: string }
}): string {
  const hora = c.fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `El profesional ya tiene una cita a las ${hora} (${c.paciente.nombre} ${c.paciente.apellido}, ${c.duracion} min). Elige otro horario o usa Sobre Agendamiento.`
}
