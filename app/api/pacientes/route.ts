import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pacientes = await prisma.paciente.findMany({ orderBy: { apellido: 'asc' } })
  return NextResponse.json(pacientes)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const paciente = await prisma.paciente.create({
    data: {
      rut: body.rut,
      nombre: body.nombre,
      apellido: body.apellido,
      telefono: body.telefono || null,
      email: body.email || null,
      prevision: body.prevision || null,
      fechaNacimiento: body.fechaNacimiento ? new Date(body.fechaNacimiento) : null,
      genero: body.genero || null,
      direccion: body.direccion || null,
    },
  })
  return NextResponse.json(paciente, { status: 201 })
}
