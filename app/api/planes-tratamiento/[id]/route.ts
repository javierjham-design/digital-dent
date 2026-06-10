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
      doctorTitular: { select: { id: true, name: true, email: true } },
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
  if (typeof body.doctorTitularId === 'string' || body.doctorTitularId === null) {
    data.doctorTitularId = body.doctorTitularId || null
  }
  if (body.fechaInicio === null) data.fechaInicio = null
  else if (typeof body.fechaInicio === 'string') data.fechaInicio = new Date(body.fechaInicio)

  // updateMany con clinicaId garantiza defensa en profundidad: aunque el
  // findFirst previo ya validó, si alguna llamada futura saltea esa validación,
  // el WHERE con clinicaId hace imposible cruzar tenants.
  const r = await prisma.planTratamiento.updateMany({ where: { id, clinicaId: u.clinicaId }, data })
  if (r.count === 0) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const plan = await prisma.planTratamiento.findUnique({ where: { id } })
  return NextResponse.json(plan)
}

// DELETE /api/planes-tratamiento/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // deleteMany con clinicaId: si el id no es de la clínica, count=0 y 404.
  const r = await prisma.planTratamiento.deleteMany({ where: { id, clinicaId: u.clinicaId } })
  if (r.count === 0) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
