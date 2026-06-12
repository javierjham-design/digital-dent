import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/clinicas/[id]/extras/[extraId]
// Body: { activo?: boolean, nombre?: string, montoMensual?: number, notas?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; extraId: string }> },
) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, extraId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (body.activo !== undefined) data.activo = Boolean(body.activo)
  if (body.nombre !== undefined) {
    const n = String(body.nombre).trim()
    if (!n) return NextResponse.json({ error: 'nombre no puede ser vacío' }, { status: 400 })
    data.nombre = n
  }
  if (body.montoMensual !== undefined) {
    const m = Number(body.montoMensual)
    if (!Number.isFinite(m) || m < 0 || m > 5_000_000) {
      return NextResponse.json({ error: 'montoMensual inválido' }, { status: 400 })
    }
    data.montoMensual = m
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null

  // updateMany con clinicaId en el WHERE: defensa multi-tenant en profundidad.
  const updated = await prisma.extraSuscripcion.updateMany({
    where: { id: extraId, clinicaId: id },
    data,
  })
  if (updated.count === 0) return NextResponse.json({ error: 'Extra no existe' }, { status: 404 })

  import('@/lib/audit-admin').then(({ auditAdmin }) => {
    auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'EDITAR_EXTRA',
      targetType: 'EXTRA_SUSCRIPCION',
      targetId: extraId,
      details: { clinicaId: id, cambios: data },
      req,
    })
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/clinicas/[id]/extras/[extraId]
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; extraId: string }> },
) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, extraId } = await params
  const deleted = await prisma.extraSuscripcion.deleteMany({
    where: { id: extraId, clinicaId: id },
  })
  if (deleted.count === 0) return NextResponse.json({ error: 'Extra no existe' }, { status: 404 })

  import('@/lib/audit-admin').then(({ auditAdmin }) => {
    auditAdmin({
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'ELIMINAR_EXTRA',
      targetType: 'EXTRA_SUSCRIPCION',
      targetId: extraId,
      details: { clinicaId: id },
      req,
    })
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
