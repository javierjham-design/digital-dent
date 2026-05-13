import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const usuarios = await prisma.user.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, puedeRecibirPagos: true, createdAt: true },
  })
  return NextResponse.json(usuarios)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const body = await req.json()
  const { name, email, password, role, rut, especialidad, telefono } = body

  if (!name || !email || !password) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })

  const hashed = await bcrypt.hash(password, 10)
  const usuario = await prisma.user.create({
    data: {
      clinicaId: u.clinicaId,
      name, email, password: hashed,
      role: role ?? 'doctor',
      rut: rut || null,
      especialidad: especialidad || null,
      telefono: telefono || null,
    },
    select: { id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, createdAt: true },
  })
  return NextResponse.json(usuario, { status: 201 })
}
