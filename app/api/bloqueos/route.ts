import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Lista bloqueos de agenda en un rango. Filtros opcionales: doctorId, from, to.
// Admin ve todos los de la clínica; un doctor solo los suyos.
export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const doctorId = searchParams.get('doctorId')

  const isAdmin = u.role === 'admin'
  const where: Record<string, unknown> = { clinicaId: u.clinicaId }

  if (doctorId) {
    where.doctorId = doctorId
  } else if (!isAdmin) {
    where.doctorId = u.id
  }

  if (from && to) {
    where.OR = [
      // Bloqueos que arrancan dentro del rango.
      { inicio: { gte: new Date(from), lte: new Date(to) } },
      // O que terminan dentro del rango.
      { fin: { gte: new Date(from), lte: new Date(to) } },
      // O que abarcan completamente el rango.
      { AND: [{ inicio: { lte: new Date(from) } }, { fin: { gte: new Date(to) } }] },
    ]
  }

  const bloqueos = await prisma.bloqueoAgenda.findMany({
    where,
    include: {
      doctor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { inicio: 'asc' },
  })
  return NextResponse.json(bloqueos)
}

// Crea un bloqueo de agenda. Admin puede crearlo para cualquier doctor;
// un doctor solo para sí mismo.
export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const doctorId = typeof body.doctorId === 'string' ? body.doctorId : ''
  const inicioRaw = body.inicio
  const finRaw = body.fin
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : ''

  if (!doctorId) return NextResponse.json({ error: 'Doctor requerido' }, { status: 400 })
  const isAdmin = u.role === 'admin'
  if (!isAdmin && doctorId !== u.id) {
    return NextResponse.json({ error: 'Solo puedes bloquear tu propio horario.' }, { status: 403 })
  }

  const inicio = inicioRaw ? new Date(inicioRaw) : null
  const fin = finRaw ? new Date(finRaw) : null
  if (!inicio || Number.isNaN(inicio.getTime())) {
    return NextResponse.json({ error: 'Fecha de inicio inválida.' }, { status: 400 })
  }
  if (!fin || Number.isNaN(fin.getTime())) {
    return NextResponse.json({ error: 'Fecha de fin inválida.' }, { status: 400 })
  }
  if (fin <= inicio) {
    return NextResponse.json({ error: 'La fecha de fin debe ser posterior al inicio.' }, { status: 400 })
  }

  // El doctor debe existir y pertenecer a la misma clínica.
  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, clinicaId: u.clinicaId },
    select: { id: true },
  })
  if (!doctor) return NextResponse.json({ error: 'Doctor no encontrado.' }, { status: 404 })

  const bloqueo = await prisma.bloqueoAgenda.create({
    data: {
      clinicaId: u.clinicaId,
      doctorId,
      inicio,
      fin,
      motivo: motivo || null,
      createdById: u.id,
      createdByName: u.name ?? u.email,
    },
    include: {
      doctor: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json(bloqueo, { status: 201 })
}
