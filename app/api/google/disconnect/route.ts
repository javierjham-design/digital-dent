import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { disconnectClinica } from '@/lib/google'

// Desconecta la clínica de Google Calendar. Revoca el refresh token en
// Google, limpia los campos de la clínica, y deja a todos los doctores
// sin googleCalendarId asignado (no tiene sentido sin conexión).
export async function POST(_req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') {
    return NextResponse.json({ error: 'Solo el admin puede desconectar Google Calendar.' }, { status: 403 })
  }

  await disconnectClinica(u.clinicaId)
  return NextResponse.json({ ok: true })
}
