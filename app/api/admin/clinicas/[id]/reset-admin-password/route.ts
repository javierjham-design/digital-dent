import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

const DEFAULT_USERNAME = 'Administrador'
const DEFAULT_PASSWORD = 'ADMIN22'

// POST /api/admin/clinicas/[id]/reset-admin-password
// Body: { newPassword?: string, forceChange?: boolean, username?: string }
// - newPassword: si vacía, usa DEFAULT_PASSWORD ("ADMIN22").
// - forceChange: si true, marca passwordChangedAt=null para forzar cambio en primer login.
// - username: por default "Administrador".
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const username = typeof body.username === 'string' && body.username.trim() ? body.username.trim() : DEFAULT_USERNAME
  const newPassword = typeof body.newPassword === 'string' && body.newPassword.length > 0 ? body.newPassword : DEFAULT_PASSWORD
  const forceChange = Boolean(body.forceChange)

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) return NextResponse.json({ error: 'Clínica no existe' }, { status: 404 })

  const user = await prisma.user.findFirst({
    where: { clinicaId: clinica.id, username },
  })
  if (!user) {
    return NextResponse.json({
      error: `No existe usuario "${username}" en esta clínica`,
    }, { status: 404 })
  }

  const hash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hash,
      activo: true,
      passwordChangedAt: forceChange ? null : new Date(),
    },
  })

  return NextResponse.json({
    ok: true,
    clinicaSlug: clinica.slug,
    username,
    nuevaPassword: newPassword,
    forzarCambio: forceChange,
  })
}
