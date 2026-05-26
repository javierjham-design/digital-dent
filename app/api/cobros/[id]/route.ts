import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const ESTADOS = ['PENDIENTE', 'PAGADO', 'PARCIAL', 'ANULADO']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.cobro.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
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
  if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null
  if (body.medioPagoId !== undefined) {
    if (body.medioPagoId === null) {
      data.medioPagoId = null
    } else {
      // verificar que el medio de pago pertenezca a la clínica
      const mp = await prisma.medioPago.findFirst({
        where: { id: body.medioPagoId, clinicaId: u.clinicaId },
        select: { id: true },
      })
      if (!mp) return NextResponse.json({ error: 'Medio de pago inválido' }, { status: 400 })
      data.medioPagoId = body.medioPagoId
    }
  }
  if (body.metodoPago !== undefined) data.metodoPago = body.metodoPago ? String(body.metodoPago) : null

  const cobro = await prisma.cobro.update({ where: { id }, data })
  return NextResponse.json(cobro)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.cobro.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.cobro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
