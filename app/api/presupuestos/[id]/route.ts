import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const ESTADOS = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'COMPLETADO']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.presupuesto.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) {
      return NextResponse.json({ error: `estado inválido. Use: ${ESTADOS.join(', ')}` }, { status: 400 })
    }
    data.estado = body.estado
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.vigencia !== undefined) data.vigencia = body.vigencia ? new Date(body.vigencia) : null
  if (body.total !== undefined) {
    const n = Number(body.total)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'total inválido' }, { status: 400 })
    data.total = n
  }

  const presupuesto = await prisma.presupuesto.update({ where: { id }, data })
  return NextResponse.json(presupuesto)
}
