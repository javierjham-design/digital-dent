import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.tratamiento.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { id: true, precio: true, descuento: true, estado: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  // Permisos: precio, descuento y revertir
  const fullUser = await prisma.user.findUnique({
    where: { id: u.id },
    select: { puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true, role: true },
  })
  const isAdmin = fullUser?.role === 'admin'
  const puedePrecio = isAdmin || fullUser?.puedeModificarPrecio
  const puedeDescuento = isAdmin || fullUser?.puedeAplicarDescuento
  const puedeRevertir = isAdmin || fullUser?.puedeRevertirCompletado

  // Cambio de estado: si estaba COMPLETADO y se intenta pasar a otro, requiere permiso.
  if (typeof body.estado === 'string') {
    const saliendoDeCompletado = existing.estado === 'COMPLETADO' && body.estado !== 'COMPLETADO'
    if (saliendoDeCompletado && !puedeRevertir) {
      return NextResponse.json({
        error: 'No tienes permisos para revertir el estado de una acción completada',
      }, { status: 403 })
    }
    data.estado = body.estado
  }

  // Campos libres
  if (typeof body.notas === 'string' || body.notas === null) data.notas = body.notas
  if (typeof body.diente === 'number' || body.diente === null) data.diente = body.diente
  if (typeof body.cara === 'string' || body.cara === null) data.cara = body.cara
  if (typeof body.doctorId === 'string' || body.doctorId === null) data.doctorId = body.doctorId
  if (typeof body.planId === 'string' || body.planId === null) data.planId = body.planId
  if (typeof body.seccionId === 'string' || body.seccionId === null) data.seccionId = body.seccionId
  if (body.fechaCompletado === null) data.fechaCompletado = null
  else if (typeof body.fechaCompletado === 'string') data.fechaCompletado = new Date(body.fechaCompletado)

  if (typeof body.precio === 'number') {
    if (!puedePrecio) {
      return NextResponse.json({ error: 'No tienes permisos para modificar el precio' }, { status: 403 })
    }
    data.precio = body.precio
  }
  if (typeof body.descuento === 'number') {
    if (!puedeDescuento) {
      return NextResponse.json({ error: 'No tienes permisos para aplicar descuentos' }, { status: 403 })
    }
    data.descuento = Math.max(0, Math.min(100, body.descuento))
  }

  const tratamiento = await prisma.tratamiento.update({
    where: { id },
    data,
    include: { prestacion: true },
  })
  return NextResponse.json(tratamiento)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.tratamiento.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.tratamiento.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
