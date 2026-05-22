import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { getPlanes } from '@/lib/plans'

export const dynamic = 'force-dynamic'

// GET /api/admin/planes-suscripcion — lista todos los planes (activos e inactivos)
export async function GET() {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const planes = await getPlanes()
  return NextResponse.json({ planes })
}

// POST /api/admin/planes-suscripcion — crea un plan nuevo
// Body: { id, nombre, descripcion?, precioMensual, precioAnual?, caracteristicas?, destacado?, orden?, activo? }
export async function POST(req: NextRequest) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const id = typeof body.id === 'string' ? body.id.trim().toUpperCase() : ''
  if (!/^[A-Z][A-Z0-9_]{1,29}$/.test(id)) {
    return NextResponse.json({ error: 'id debe ser un código en mayúsculas (ej: ENTERPRISE)' }, { status: 400 })
  }

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const precioMensual = Number(body.precioMensual)
  if (!Number.isFinite(precioMensual) || precioMensual < 0) {
    return NextResponse.json({ error: 'precioMensual inválido' }, { status: 400 })
  }

  let precioAnual: number | null = null
  if (body.precioAnual != null && body.precioAnual !== '') {
    const n = Number(body.precioAnual)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'precioAnual inválido' }, { status: 400 })
    precioAnual = n
  }

  const caracteristicas = Array.isArray(body.caracteristicas)
    ? body.caracteristicas.filter((s: unknown): s is string => typeof s === 'string')
    : []

  const existe = await prisma.planSuscripcion.findUnique({ where: { id } })
  if (existe) return NextResponse.json({ error: `Ya existe un plan con id "${id}"` }, { status: 409 })

  const plan = await prisma.planSuscripcion.create({
    data: {
      id,
      nombre,
      descripcion: typeof body.descripcion === 'string' ? body.descripcion : null,
      precioMensual,
      precioAnual,
      caracteristicas: JSON.stringify(caracteristicas),
      destacado: Boolean(body.destacado),
      orden: Number.isFinite(Number(body.orden)) ? Number(body.orden) : 0,
      activo: body.activo !== undefined ? Boolean(body.activo) : true,
    },
  })

  return NextResponse.json({ ok: true, plan }, { status: 201 })
}
