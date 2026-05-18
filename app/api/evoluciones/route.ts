import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/evoluciones?pacienteId=xxx
export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pacienteId = req.nextUrl.searchParams.get('pacienteId')
  if (!pacienteId) return NextResponse.json({ error: 'Falta pacienteId' }, { status: 400 })

  const evos = await prisma.evolucion.findMany({
    where: { clinicaId: u.clinicaId, pacienteId },
    orderBy: { createdAt: 'desc' },
    include: {
      autor: { select: { id: true, name: true, email: true, username: true } },
      tratamiento: {
        select: {
          id: true, diente: true, cara: true,
          prestacion: { select: { nombre: true } },
        },
      },
    },
  })

  return NextResponse.json(evos)
}

// POST /api/evoluciones
// Body: { pacienteId, tratamientoId?, texto }
export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.pacienteId || !body?.texto?.trim()) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  const paciente = await prisma.paciente.findFirst({
    where: { id: body.pacienteId, clinicaId: u.clinicaId },
    select: { id: true },
  })
  if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

  if (body.tratamientoId) {
    const t = await prisma.tratamiento.findFirst({
      where: { id: body.tratamientoId, clinicaId: u.clinicaId },
      select: { id: true },
    })
    if (!t) return NextResponse.json({ error: 'Tratamiento no encontrado' }, { status: 404 })
  }

  const evo = await prisma.evolucion.create({
    data: {
      clinicaId: u.clinicaId,
      pacienteId: body.pacienteId,
      tratamientoId: body.tratamientoId || null,
      autorId: u.id,
      texto: String(body.texto).trim(),
    },
    include: {
      autor: { select: { id: true, name: true, email: true, username: true } },
    },
  })

  return NextResponse.json(evo, { status: 201 })
}
