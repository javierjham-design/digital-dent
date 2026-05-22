import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/planes-suscripcion/[id] — actualiza un plan
// Body: cualquier subset de { nombre, descripcion, precioMensual, precioAnual,
//                              caracteristicas, destacado, orden, activo }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const existe = await prisma.planSuscripcion.findUnique({ where: { id } })
  if (!existe) return NextResponse.json({ error: 'Plan no existe' }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (typeof body.nombre === 'string') {
    const n = body.nombre.trim()
    if (!n) return NextResponse.json({ error: 'nombre vacío' }, { status: 400 })
    data.nombre = n
  }
  if (body.descripcion !== undefined) {
    data.descripcion = body.descripcion ? String(body.descripcion) : null
  }
  if (body.precioMensual !== undefined) {
    const n = Number(body.precioMensual)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'precioMensual inválido' }, { status: 400 })
    data.precioMensual = n
  }
  if (body.precioAnual !== undefined) {
    if (body.precioAnual === null || body.precioAnual === '') {
      data.precioAnual = null
    } else {
      const n = Number(body.precioAnual)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'precioAnual inválido' }, { status: 400 })
      data.precioAnual = n
    }
  }
  if (Array.isArray(body.caracteristicas)) {
    const arr = body.caracteristicas.filter((s: unknown): s is string => typeof s === 'string')
    data.caracteristicas = JSON.stringify(arr)
  }
  if (body.destacado !== undefined) data.destacado = Boolean(body.destacado)
  if (body.orden !== undefined && Number.isFinite(Number(body.orden))) data.orden = Number(body.orden)
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  const plan = await prisma.planSuscripcion.update({ where: { id }, data })
  return NextResponse.json({ ok: true, plan })
}

// DELETE /api/admin/planes-suscripcion/[id] — elimina un plan.
// Falla si alguna clínica lo está usando.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const enUso = await prisma.clinica.count({ where: { plan: id } })
  if (enUso > 0) {
    return NextResponse.json({
      error: `No se puede eliminar: ${enUso} clínica${enUso > 1 ? 's' : ''} usa${enUso > 1 ? 'n' : ''} este plan. Migrá esas clínicas a otro plan primero, o desactivá el plan en lugar de eliminarlo.`,
    }, { status: 409 })
  }

  await prisma.planSuscripcion.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
