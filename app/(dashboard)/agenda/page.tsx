export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { AgendaClient } from './agenda-client'

export default async function AgendaPage() {
  const [citas, doctors, pacientes, horarios] = await Promise.all([
    prisma.cita.findMany({
      include: { paciente: true, doctor: true },
      orderBy: { fecha: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: { in: ['admin', 'doctor'] }, activo: true },
      select: { id: true, name: true, email: true },
    }),
    prisma.paciente.findMany({
      where: { activo: true },
      select: { id: true, rut: true, nombre: true, apellido: true, telefono: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.horarioDoctor.findMany({
      orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
    }),
  ])

  return (
    <AgendaClient
      citas={citas.map((c) => ({
        id:               c.id,
        pacienteNombre:   `${c.paciente.nombre} ${c.paciente.apellido}`,
        pacienteRut:      c.paciente.rut,
        pacienteTelefono: c.paciente.telefono,
        pacienteId:       c.pacienteId,
        doctorId:         c.doctorId,
        doctor:           c.doctor.name ?? c.doctor.email,
        start:            c.fecha.toISOString(),
        end:              new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
        estado:           c.estado,
        tipo:             c.tipo ?? 'CONSULTA',
        notas:            c.notas ?? '',
      }))}
      doctors={doctors}
      pacientes={pacientes}
      horarios={horarios}
    />
  )
}
