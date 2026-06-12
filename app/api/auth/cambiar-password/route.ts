import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { rateLimit } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

// Política de contraseñas: mínimo 8 caracteres con al menos una letra y un
// número. Aplica a contraseñas NUEVAS; las existentes no se invalidan.
function validarPassword(pw: string): string | null {
  if (pw.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.'
  if (!/[a-zA-Z]/.test(pw)) return 'La nueva contraseña debe incluir al menos una letra.'
  if (!/[0-9]/.test(pw)) return 'La nueva contraseña debe incluir al menos un número.'
  return null
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Anti fuerza bruta de la contraseña actual: 5 intentos / 15 min por usuario.
  const rl = rateLimit(`pwchange:${u.id}`, { limit: 5, windowMs: 15 * 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `Demasiados intentos. Espera ${Math.ceil(rl.retryAfterSec / 60)} minutos.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  if (!body?.currentPassword || !body?.newPassword) {
    return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
  }

  const politicaError = validarPassword(String(body.newPassword))
  if (politicaError) {
    return NextResponse.json({ error: politicaError }, { status: 400 })
  }

  const dbUser = await prisma.user.findUnique({ where: { id: u.id } })
  if (!dbUser) return NextResponse.json({ error: 'Usuario no existe' }, { status: 404 })

  const ok = await bcrypt.compare(body.currentPassword, dbUser.password)
  if (!ok) return NextResponse.json({ error: 'La contraseña actual no es correcta' }, { status: 400 })

  if (body.currentPassword === body.newPassword) {
    return NextResponse.json({ error: 'La nueva contraseña debe ser distinta de la actual.' }, { status: 400 })
  }

  const hash = await bcrypt.hash(body.newPassword, 12)
  await prisma.user.update({
    where: { id: u.id },
    data: { password: hash, passwordChangedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
