import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const medios = await prisma.medioPago.findMany({ orderBy: { nombre: 'asc' } })
  return NextResponse.json(medios)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const medio = await prisma.medioPago.create({
    data: { nombre: body.nombre, comision: Number(body.comision) || 0 },
  })
  return NextResponse.json(medio, { status: 201 })
}
