import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/clinicas/[id]/extras — lista los extras de la clínica
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const extras = await prisma.extraSuscripcion.findMany({
    where: { clinicaId: id },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ extras })
}

// POST /api/admin/clinicas/[id]/extras — crea un extra recurrente
// Body: { nombre: string, montoMensual: number, codigo?: string, notas?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'nombre es requerido' }, { status: 400 })

  const monto = Number(body.montoMensual)
  if (!Number.isFinite(monto) || monto < 0) {
    return NextResponse.json({ error: 'montoMensual debe ser un número ≥ 0' }, { status: 400 })
  }
  if (monto > 5_000_000) {
    return NextResponse.json({ error: 'Monto fuera de rango razonable (máximo $5.000.000/mes)' }, { status: 400 })
  }

  const clinica = await prisma.clinica.findUnique({ where: { id }, select: { id: true, slug: true } })
  if (!clinica) return NextResponse.json({ error: 'Clínica no existe' }, { status: 404 })

  const extra = await prisma.extraSuscripcion.create({
    data: {
      clinicaId: id,
      codigo: typeof body.codigo === 'string' && body.codigo ? body.codigo.toUpperCase() : 'OTRO',
      nombre,
      montoMensual: monto,
      notas: body.notas ? String(body.notas) : null,
    },
  })

  import('@/lib/audit-admin').then(({ auditAdmin }) => {
    auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'CREAR_EXTRA',
      targetType: 'EXTRA_SUSCRIPCION',
      targetId: extra.id,
      details: { clinicaSlug: clinica.slug, nombre, montoMensual: monto },
      req,
    })
  }).catch(() => {})

  return NextResponse.json({ ok: true, extra }, { status: 201 })
}
