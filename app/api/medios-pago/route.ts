import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const medios = await prisma.medioPago.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(medios)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })

  const comision = body.comision != null ? Number(body.comision) : 0
  if (!Number.isFinite(comision) || comision < 0 || comision > 100) {
    return NextResponse.json({ error: 'comision debe estar entre 0 y 100' }, { status: 400 })
  }

  const medio = await prisma.medioPago.create({
    data: { clinicaId: u.clinicaId, nombre, comision },
  })
  return NextResponse.json(medio, { status: 201 })
}
