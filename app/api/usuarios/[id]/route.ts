import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'

const ROLES_PERMITIDOS = ['admin', 'doctor', 'staff']

// Campos que un usuario puede editar de sí mismo (no admin)
const CAMPOS_PROPIOS = ['name', 'rut', 'especialidad', 'telefono'] as const

// Campos adicionales que solo un admin puede editar
const CAMPOS_ADMIN = [
  'name', 'email', 'role', 'rut', 'especialidad', 'telefono', 'activo',
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

  // Validaciones específicas
  if ('role' in data) {
    if (!ROLES_PERMITIDOS.includes(data.role as string)) {
      return NextResponse.json({ error: `role inválido. Use: ${ROLES_PERMITIDOS.join(', ')}` }, { status: 400 })
    }
  }
  if ('email' in data && data.email) {
    const otro = await prisma.user.findUnique({ where: { email: data.email as string }, select: { id: true } })
    if (otro && otro.id !== id) {
      return NextResponse.json({ error: 'Ya existe otro usuario con ese email' }, { status: 409 })
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
      id: true, name: true, email: true, role: true, rut: true, especialidad: true, telefono: true, activo: true,
      puedeRecibirPagos: true, puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true,
      createdAt: true,
    },
  })
  return NextResponse.json(usuario)
}
