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
  const medio = await prisma.medioPago.create({
    data: {
      clinicaId: u.clinicaId,
      nombre: body.nombre,
      comision: Number(body.comision) || 0,
    },
  })
  return NextResponse.json(medio, { status: 201 })
}
