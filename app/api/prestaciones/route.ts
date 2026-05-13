import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const prestaciones = await prisma.prestacion.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: [{ categoria: 'asc' }, { nombre: 'asc' }],
  })
  return NextResponse.json(prestaciones)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { nombre, categoria, precio, descripcion } = body
  if (!nombre || precio == null) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const prestacion = await prisma.prestacion.create({
    data: {
      clinicaId: u.clinicaId,
      nombre,
      categoria: categoria || null,
      precio: Number(precio),
      descripcion: descripcion || null,
      activo: true,
    },
  })
  return NextResponse.json(prestacion, { status: 201 })
}
