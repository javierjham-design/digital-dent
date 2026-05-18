import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/planes-tratamiento/[id] — devuelve el plan con secciones y tratamientos
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const tratamientoInclude = {
    prestacion: { select: { id: true, nombre: true, categoria: true, precio: true } },
    doctor: { select: { id: true, name: true } },
    cobroItems: {
      select: {
        id: true,
        monto: true,
        cobro: { select: { id: true, numero: true, estado: true, fechaPago: true } },
      },
    },
  } as const

  const plan = await prisma.planTratamiento.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      secciones: {
        orderBy: { orden: 'asc' },
        include: {
          tratamientos: {
            orderBy: { fecha: 'asc' },
            include: tratamientoInclude,
          },
        },
      },
      tratamientos: {
        where: { seccionId: null },
        orderBy: { fecha: 'asc' },
        include: tratamientoInclude,
      },
    },
  })

  if (!plan) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json(plan)
}

// PATCH /api/planes-tratamiento/[id]
// Body: { nombre?, notas?, estado?, fechaInicio? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.planTratamiento.findFirst({ where: { id, clinicaId: u.clinicaId } })
  if (!existing) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.nombre === 'string') data.nombre = body.nombre
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.estado === 'string') data.estado = body.estado
  if (body.fechaInicio === null) data.fechaInicio = null
  else if (typeof body.fechaInicio === 'string') data.fechaInicio = new Date(body.fechaInicio)

  const plan = await prisma.planTratamiento.update({ where: { id }, data })
  return NextResponse.json(plan)
}

// DELETE /api/planes-tratamiento/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.planTratamiento.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { _count: { select: { tratamientos: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  // Borrar secciones (cascada al borrar el plan); tratamientos quedan con planId=null por onDelete: SetNull
  await prisma.planTratamiento.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
