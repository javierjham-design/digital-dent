import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.prestacion.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.nombre !== undefined) {
    const s = String(body.nombre).trim()
    if (!s) return NextResponse.json({ error: 'nombre vacío' }, { status: 400 })
    data.nombre = s
  }
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.precio !== undefined) {
    const n = Number(body.precio)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'precio inválido' }, { status: 400 })
    data.precio = n
  }
  if (body.duracion !== undefined) {
    const n = Number(body.duracion)
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'duracion inválida' }, { status: 400 })
    data.duracion = n
  }
  if (body.categoria !== undefined) data.categoria = body.categoria ? String(body.categoria) : null
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  const prestacion = await prisma.prestacion.update({ where: { id }, data })
  return NextResponse.json(prestacion)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.prestacion.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.prestacion.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
