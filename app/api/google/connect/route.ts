import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { buildAuthUrl, signOAuthState } from '@/lib/google'

// Inicia el flujo OAuth con Google. Solo admin de la clínica.
// El state firmado lleva clinicaId + slug + userId para que el callback
// (que es global, en app.clariva.cl) sepa de qué clínica proviene.
export async function GET(_req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') {
    return NextResponse.json({ error: 'Solo el admin puede conectar Google Calendar.' }, { status: 403 })
  }

  const clinica = await prisma.clinica.findUnique({
    where: { id: u.clinicaId },
    select: { id: true, slug: true },
  })
  if (!clinica) return NextResponse.json({ error: 'Clínica no encontrada.' }, { status: 404 })

  const state = signOAuthState({
    clinicaId: clinica.id,
    slug: clinica.slug,
    userId: u.id,
  })
  const authUrl = buildAuthUrl(state)
  return NextResponse.redirect(authUrl)
}
