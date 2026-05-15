import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.currentPassword || !body?.newPassword) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  if (String(body.newPassword).length < 6) {
    return NextResponse.json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: u.id } })
  if (!dbUser) return NextResponse.json({ error: 'Usuario no existe' }, { status: 404 })

  const ok = await bcrypt.compare(body.currentPassword, dbUser.password)
  if (!ok) return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 })

  const hash = await bcrypt.hash(body.newPassword, 10)
  await prisma.user.update({
    where: { id: u.id },
    data: { password: hash, passwordChangedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
