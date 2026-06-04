import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  const citas = await prisma.cita.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(from && to ? { fecha: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    include: { paciente: true, doctor: true },
    orderBy: { fecha: 'asc' },
  })
  return NextResponse.json(citas)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const userName = u.name ?? u.email ?? 'Sistema'

  if (!body.pacienteId || !body.doctorId || !body.fecha) {
    return NextResponse.json({ error: 'Faltan campos requeridos (pacienteId, doctorId, fecha)' }, { status: 400 })
  }

  // Verificar que paciente y doctor pertenezcan a la clínica del usuario.
  const [paciente, doctor] = await Promise.all([
    prisma.paciente.findFirst({ where: { id: body.pacienteId, clinicaId: u.clinicaId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: body.doctorId, clinicaId: u.clinicaId, activo: true }, select: { id: true } }),
  ])
  if (!paciente) return NextResponse.json({ error: 'Paciente no existe en esta clínica' }, { status: 404 })
  if (!doctor) return NextResponse.json({ error: 'Doctor no existe en esta clínica' }, { status: 404 })

  const sobrecupo = Boolean(body.sobrecupo)
  const fechaInicio = new Date(body.fecha)
  const fechaFin = new Date(fechaInicio.getTime() + (Number(body.duracion) || 30) * 60000)

  // No permitir agendar sobre un bloqueo del mismo doctor. Sobrecupo igual respeta
  // bloqueos: si el doctor declaró que no está, no hay agenda paralela posible.
  const choca = await prisma.bloqueoAgenda.findFirst({
    where: {
      clinicaId: u.clinicaId,
      doctorId: body.doctorId,
      // Hay overlap si: bloqueo.inicio < cita.fin AND bloqueo.fin > cita.inicio.
      inicio: { lt: fechaFin },
      fin: { gt: fechaInicio },
    },
    select: { id: true, motivo: true, inicio: true, fin: true },
  })
  if (choca) {
    return NextResponse.json({
      error: `El doctor tiene un bloqueo de agenda en ese horario${choca.motivo ? ` (${choca.motivo})` : ''}. Elige otro horario o elimina el bloqueo primero.`,
    }, { status: 409 })
  }

  const cita = await prisma.cita.create({
    data: {
      clinicaId:  u.clinicaId,
      pacienteId: body.pacienteId,
      doctorId:   body.doctorId,
      fecha:      new Date(body.fecha),
      duracion:   Number(body.duracion) || 30,
      tipo:       body.tipo  || 'CONSULTA',
      notas:      body.notas || null,
      sala:       body.sala  || null,
      sobrecupo,
      logs: {
        create: {
          tipo:     'AGENDADA',
          detalle:  `Cita ${sobrecupo ? 'sobrecupo ' : ''}agendada por ${userName}`,
          userName,
        },
      },
    },
  })
  return NextResponse.json(cita, { status: 201 })
}
