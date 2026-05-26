import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const TIPOS = ['PORCENTAJE', 'MONTO_FIJO']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.contrato.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.tipo !== undefined) {
    if (!TIPOS.includes(body.tipo)) {
      return NextResponse.json({ error: `tipo inválido. Use: ${TIPOS.join(', ')}` }, { status: 400 })
    }
    data.tipo = body.tipo
  }
  if (body.porcentaje !== undefined) {
    if (body.porcentaje === null) data.porcentaje = null
    else {
      const n = Number(body.porcentaje)
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: 'porcentaje debe estar entre 0 y 100' }, { status: 400 })
      }
      data.porcentaje = n
    }
  }
  if (body.montoFijo !== undefined) {
    if (body.montoFijo === null) data.montoFijo = null
    else {
      const n = Number(body.montoFijo)
      if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'montoFijo inválido' }, { status: 400 })
      data.montoFijo = n
    }
  }
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.fechaInicio !== undefined) data.fechaInicio = new Date(body.fechaInicio)
  if (body.fechaFin !== undefined) data.fechaFin = body.fechaFin ? new Date(body.fechaFin) : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  const contrato = await prisma.contrato.update({ where: { id }, data })
  return NextResponse.json(contrato)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.contrato.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.contrato.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
