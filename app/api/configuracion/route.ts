import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const config = await prisma.configuracion.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })
  return NextResponse.json(config)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const config = await prisma.configuracion.upsert({
    where: { id: 'singleton' },
    update: {
      clinica:   body.clinica   ?? undefined,
      direccion: body.direccion ?? undefined,
      telefono:  body.telefono  ?? undefined,
      email:     body.email     ?? undefined,
      ciudad:    body.ciudad    ?? undefined,
    },
    create: {
      id: 'singleton',
      clinica:   body.clinica   ?? 'Digital-Dent',
      direccion: body.direccion ?? '',
      telefono:  body.telefono  ?? '',
      email:     body.email     ?? '',
      ciudad:    body.ciudad    ?? 'Temuco',
    },
  })
  return NextResponse.json(config)
}
