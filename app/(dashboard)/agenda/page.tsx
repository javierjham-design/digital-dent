export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { AgendaClient } from './agenda-client'

export default async function AgendaPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const [citas, doctors, pacientes, horarios, clinica] = await Promise.all([
    prisma.cita.findMany({
      where: { clinicaId: u.clinicaId },
      include: {
        paciente: true,
        doctor: true,
        logs: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { fecha: 'asc' },
    }),
    prisma.user.findMany({
      where: { clinicaId: u.clinicaId, role: { in: ['admin', 'doctor'] }, activo: true },
      select: { id: true, name: true, email: true },
    }),
    prisma.paciente.findMany({
      where: { clinicaId: u.clinicaId, activo: true },
      select: { id: true, rut: true, nombre: true, apellido: true, telefono: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.horarioDoctor.findMany({
      where: { clinicaId: u.clinicaId },
      orderBy: [{ doctorId: 'asc' }, { diaSemana: 'asc' }],
    }),
    prisma.clinica.findUnique({ where: { id: u.clinicaId } }),
  ])
  const config = clinica!

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
        confirmadoWA:     c.confirmadoWA,
        logs:             c.logs.map(l => ({
          id:        l.id,
          tipo:      l.tipo,
          detalle:   l.detalle,
          userName:  l.userName,
          createdAt: l.createdAt.toISOString(),
        })),
      }))}
      doctors={doctors}
      pacientes={pacientes}
      horarios={horarios}
      config={{ clinica: config.nombre, direccion: config.direccion, ciudad: config.ciudad, mensajeWA: config.mensajeWA }}
    />
  )
}
