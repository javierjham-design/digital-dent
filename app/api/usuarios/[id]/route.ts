import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const ROLES_PERMITIDOS = ['admin', 'doctor', 'staff']
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,30}$/

// Campos que un usuario puede editar de sí mismo (no admin)
const CAMPOS_PROPIOS = ['name', 'rut', 'especialidad', 'telefono'] as const

// Campos adicionales que solo un admin puede editar
const CAMPOS_ADMIN = [
  'name', 'username', 'email', 'role', 'rut', 'especialidad', 'telefono', 'activo',
  'puedeRecibirPagos', 'puedeModificarPrecio', 'puedeAplicarDescuento', 'puedeRevertirCompletado',
] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const existing = await prisma.user.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Solo admin puede editar a otros; un usuario sí puede editarse a sí mismo (subset).
  const editandoOtro = u.id !== id
  if (editandoOtro && u.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin puede editar a otros usuarios' }, { status: 403 })
  }

  const body = await req.json()
  const allowed = u.role === 'admin' ? CAMPOS_ADMIN : CAMPOS_PROPIOS
  const data: Record<string, unknown> = {}

  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key]
  }

  // Normalizaciones / validaciones
  if ('role' in data) {
    if (!ROLES_PERMITIDOS.includes(data.role as string)) {
      return NextResponse.json({ error: `role inválido. Use: ${ROLES_PERMITIDOS.join(', ')}` }, { status: 400 })
    }
  }

  if ('username' in data) {
    if (data.username === null || data.username === '') {
      return NextResponse.json({ error: 'El nombre de usuario no puede quedar vacío' }, { status: 400 })
    }
    const username = String(data.username).trim().toLowerCase()
    if (!USERNAME_RE.test(username)) {
      return NextResponse.json({
        error: 'El nombre de usuario solo puede tener letras, números, puntos, guiones y guiones bajos (2 a 31 caracteres, sin espacios ni acentos).',
      }, { status: 400 })
    }
    const otro = await prisma.user.findFirst({
      where: { clinicaId: u.clinicaId, username, NOT: { id } },
      select: { id: true },
    })
    if (otro) {
      return NextResponse.json({ error: `Ya existe otro usuario "${username}" en esta clínica` }, { status: 409 })
    }
    data.username = username
  }

  if ('email' in data) {
    if (data.email === null || data.email === '') {
      data.email = null
    } else {
      const email = String(data.email).trim().toLowerCase()
      const otro = await prisma.user.findUnique({ where: { email }, select: { id: true } })
      if (otro && otro.id !== id) {
        return NextResponse.json({ error: 'Ya existe otro usuario con ese email' }, { status: 409 })
      }
      data.email = email
    }
  }

  // Password va por separado (no en CAMPOS_*): se permite si edita propio o si es admin.
  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: 'Password muy corto (mínimo 6)' }, { status: 400 })
    }
    data.password = await bcrypt.hash(body.password, 10)
    data.passwordChangedAt = new Date()
  }

  const usuario = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, name: true, username: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true,
      puedeRecibirPagos: true, puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true,
      createdAt: true,
    },
  })
  return NextResponse.json(usuario)
}
