import { NextRequest, NextResponse } from 'next/server'
import { syncAllMappedUsers, syncCalendar } from '@/lib/google-sync'
import { getSessionUser } from '@/lib/auth'

// Endpoint que dispara un pull desde Google a Cláriva.
// Modos de autenticación:
//   - Header `x-cron-secret` = `CRON_SECRET` → ejecuta para TODOS los usuarios
//     con calendario mapeado en TODAS las clínicas con conexión activa.
//     Esto es lo que un cron job externo invoca cada 2 minutos.
//   - Sesión activa (admin/gestor) → ejecuta SOLO para los usuarios de la
//     propia clínica. Útil para botón "Sincronizar ahora" en la UI.
//   - Sin auth → 401.
//
// Body opcional: { userId } para focalizar a un solo doctor.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  const isCron = Boolean(cronSecret && headerSecret && headerSecret === cronSecret)

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.userId === 'string' ? body.userId : null

  // 1) Cron: si pasó el secreto, ejecutamos sin sesión.
  if (isCron) {
    if (targetUserId) {
      const summary = await syncCalendar(targetUserId)
      return NextResponse.json({ summaries: [summary] })
    }
    const summaries = await syncAllMappedUsers()
    return NextResponse.json({ summaries })
  }

  // 2) Trigger manual desde la UI: requiere sesión y restringe el alcance
  //    a la clínica del usuario.
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin' && !u.puedeGestionarLiquidaciones) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (targetUserId) {
    // Verificamos que el usuario target sea de la misma clínica.
    const { prisma } = await import('@/lib/prisma')
    const ok = await prisma.user.findFirst({
      where: { id: targetUserId, clinicaId: u.clinicaId },
      select: { id: true },
    })
    if (!ok) return NextResponse.json({ error: 'User not in clinic' }, { status: 404 })
    const summary = await syncCalendar(targetUserId)
    return NextResponse.json({ summaries: [summary] })
  }

  // Sin userId pero con sesión: sincroniza a todos los users de la clínica.
  const { prisma } = await import('@/lib/prisma')
  const users = await prisma.user.findMany({
    where: {
      clinicaId: u.clinicaId,
      activo: true,
      googleCalendarId: { not: null },
    },
    select: { id: true },
  })
  const summaries = []
  for (const usr of users) {
    summaries.push(await syncCalendar(usr.id))
  }
  return NextResponse.json({ summaries })
}
