import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/planes-tratamiento?pacienteId=xxx
export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pacienteId = req.nextUrl.searchParams.get('pacienteId')
  if (!pacienteId) return NextResponse.json({ error: 'Falta pacienteId' }, { status: 400 })

  const planes = await prisma.planTratamiento.findMany({
    where: { clinicaId: u.clinicaId, pacienteId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { tratamientos: true, secciones: true } },
    },
  })

  return NextResponse.json(planes)
}

// POST /api/planes-tratamiento
// Body: { pacienteId, nombre?, notas?, fechaInicio? }
export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.pacienteId) return NextResponse.json({ error: 'Falta pacienteId' }, { status: 400 })

  // Asegurar que el paciente pertenece a la clínica
  const paciente = await prisma.paciente.findFirst({
    where: { id: body.pacienteId, clinicaId: u.clinicaId },
  })
  if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

  const plan = await prisma.planTratamiento.create({
    data: {
      clinicaId: u.clinicaId,
      pacienteId: body.pacienteId,
      nombre: body.nombre || 'Plan de tratamiento',
      notas: body.notas || null,
      fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
    },
  })

  return NextResponse.json(plan, { status: 201 })
}
