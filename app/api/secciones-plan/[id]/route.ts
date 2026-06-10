import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function loadSeccion(id: string, clinicaId: string) {
  return prisma.seccionPlan.findFirst({
    where: { id, plan: { clinicaId } },
  })
}

// PATCH /api/secciones-plan/[id]
// Body: { titulo?, fechaTentativa?, diasDesdeAnterior?, notas?, orden? }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const seccion = await loadSeccion(id, u.clinicaId)
  if (!seccion) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const data: Record<string, unknown> = {}
  if (typeof body.titulo === 'string') data.titulo = body.titulo
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.orden === 'number') data.orden = body.orden
  if (typeof body.diasDesdeAnterior === 'number' || body.diasDesdeAnterior === null) data.diasDesdeAnterior = body.diasDesdeAnterior
  if (body.fechaTentativa === null) data.fechaTentativa = null
  else if (typeof body.fechaTentativa === 'string') data.fechaTentativa = new Date(body.fechaTentativa)

  // updateMany con filtro multi-tenant (vía relación plan.clinicaId).
  const r = await prisma.seccionPlan.updateMany({
    where: { id, plan: { clinicaId: u.clinicaId } },
    data,
  })
  if (r.count === 0) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  const updated = await prisma.seccionPlan.findUnique({ where: { id } })
  return NextResponse.json(updated)
}

// DELETE /api/secciones-plan/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // deleteMany con filtro de clinicaId vía relación. Tratamientos vinculados
  // quedan con seccionId=null (onDelete: SetNull).
  const r = await prisma.seccionPlan.deleteMany({
    where: { id, plan: { clinicaId: u.clinicaId } },
  })
  if (r.count === 0) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
