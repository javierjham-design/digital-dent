import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { listCalendars } from '@/lib/google'

// Lista los calendarios de la cuenta de Google conectada a la clínica.
// Solo accesible para admins (para asignar calendario por doctor).
export async function GET(_req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') {
    return NextResponse.json({ error: 'Solo el admin puede listar calendarios.' }, { status: 403 })
  }

  try {
    const calendars = await listCalendars(u.clinicaId)
    return NextResponse.json(calendars)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al listar calendarios.'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
