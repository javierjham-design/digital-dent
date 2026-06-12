import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { enviarRecordatoriosPendientes } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

// Dispara el envío de recordatorios de WhatsApp pendientes.
// Auth (igual que /api/google/sync):
//   - Header `x-cron-secret` = CRON_SECRET → corre para todas las clínicas
//     habilitadas (esto invoca el cron de Railway cada hora).
//   - Sesión activa de admin → permite forzar el envío manualmente.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  const isCron = Boolean(cronSecret && headerSecret && headerSecret === cronSecret)

  if (!isCron) {
    const u = await getSessionUser()
    if (!u || (u.role !== 'admin' && !u.isPlatformAdmin)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const resultado = await enviarRecordatoriosPendientes()
  return NextResponse.json(resultado)
}
