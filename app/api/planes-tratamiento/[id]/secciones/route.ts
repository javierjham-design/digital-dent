import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/planes-tratamiento/[id]/secciones
// Body: { titulo?, fechaTentativa?, diasDesdeAnterior?, notas? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: planId } = await params

  const plan = await prisma.planTratamiento.findFirst({ where: { id: planId, clinicaId: u.clinicaId } })
  if (!plan) return NextResponse.json({ error: 'Plan no existe' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const maxOrden = await prisma.seccionPlan.aggregate({
    where: { planId },
    _max: { orden: true },
  })
  const nextOrden = (maxOrden._max.orden ?? -1) + 1

  const seccion = await prisma.seccionPlan.create({
    data: {
      planId,
      titulo: typeof body.titulo === 'string' && body.titulo.trim() ? body.titulo.trim() : `Sección ${nextOrden + 1}`,
      orden: nextOrden,
      fechaTentativa: body.fechaTentativa ? new Date(body.fechaTentativa) : null,
      diasDesdeAnterior: typeof body.diasDesdeAnterior === 'number' ? body.diasDesdeAnterior : null,
      notas: body.notas || null,
    },
  })

  return NextResponse.json(seccion, { status: 201 })
}
