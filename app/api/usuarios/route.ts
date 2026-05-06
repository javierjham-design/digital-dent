import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function GET() {
  const usuarios = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, createdAt: true },
  })
  return NextResponse.json(usuarios)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, password, role, rut, especialidad, telefono } = body

  if (!name || !email || !password) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const hashed = await bcrypt.hash(password, 10)
  const usuario = await prisma.user.create({
    data: { name, email, password: hashed, role: role ?? 'doctor', rut: rut || null, especialidad: especialidad || null, telefono: telefono || null },
    select: { id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, createdAt: true },
  })
  return NextResponse.json(usuario, { status: 201 })
}
