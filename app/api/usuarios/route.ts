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
    select: {
      id: true, name: true, username: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true,
      puedeRecibirPagos: true, puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true,
      createdAt: true,
    },
  })
  return NextResponse.json(usuarios)
}

const ROLES_PERMITIDOS = ['admin', 'doctor', 'medico', 'staff']
const ROLES_CON_AGENDA = ['doctor', 'medico']
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/

function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (!s) return null
  return s
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const body = await req.json()
  const { name, password, role, rut, especialidad, telefono } = body

  if (!name) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })

  const username = normalizeUsername(body.username)
  if (!username) {
    return NextResponse.json({ error: 'Falta el nombre de usuario (login)' }, { status: 400 })
  }
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json({
      error: 'El nombre de usuario solo puede tener letras, números, puntos, guiones y guiones bajos (2 a 31 caracteres, sin espacios ni acentos).',
    }, { status: 400 })
  }

  // Email es opcional. Si viene, normalizamos a null si está vacío.
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null

  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password debe tener al menos 8 caracteres' }, { status: 400 })
  }

  const roleFinal = role ?? 'doctor'
  if (!ROLES_PERMITIDOS.includes(roleFinal)) {
    return NextResponse.json({ error: `role inválido. Use: ${ROLES_PERMITIDOS.join(', ')}` }, { status: 400 })
  }

  // username único POR CLÍNICA (constraint compuesto en el schema)
  const existsUsername = await prisma.user.findFirst({
    where: { clinicaId: u.clinicaId, username },
    select: { id: true },
  })
  if (existsUsername) {
    return NextResponse.json({ error: `Ya existe un usuario "${username}" en esta clínica` }, { status: 409 })
  }

  // email único globalmente solo si viene
  if (email) {
    const existsEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existsEmail) return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
  }

  const hashed = await bcrypt.hash(password, 10)
  const usuario = await prisma.user.create({
    data: {
      clinicaId: u.clinicaId,
      name,
      username,
      email,
      password: hashed,
      role: roleFinal,
      rut: rut || null,
      especialidad: especialidad || null,
      telefono: telefono || null,
      isPlatformAdmin: false,
    },
    select: { id: true, name: true, username: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true, createdAt: true },
  })
  return NextResponse.json(usuario, { status: 201 })
}
