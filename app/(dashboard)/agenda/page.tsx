import { prisma } from '@/lib/prisma'
import { AgendaClient } from './agenda-client'

export default async function AgendaPage() {
  const [citas, doctors] = await Promise.all([
    prisma.cita.findMany({
      include: { paciente: true, doctor: true },
      orderBy: { fecha: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: { in: ['admin', 'doctor'] } },
      select: { id: true, name: true, email: true },
    }),
  ])

  return (
    <AgendaClient
      citas={citas.map((c) => ({
        id: c.id,
        title: `${c.paciente.nombre} ${c.paciente.apellido}`,
        start: c.fecha.toISOString(),
        end: new Date(c.fecha.getTime() + c.duracion * 60000).toISOString(),
        estado: c.estado,
        tipo: c.tipo ?? 'CONSULTA',
        doctor: c.doctor.name ?? c.doctor.email,
        pacienteId: c.pacienteId,
        doctorId: c.doctorId,
        notas: c.notas ?? '',
      }))}
      doctors={doctors}
    />
  )
}
