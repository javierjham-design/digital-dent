import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const u = await getSessionUser()
  if (!u) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({
    ok: true,
    isPlatformAdmin: u.isPlatformAdmin,
    clinicaId: u.clinicaId,
    role: u.role,
  })
}
