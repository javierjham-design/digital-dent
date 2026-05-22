import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/admin/clinicas/[id]/extender-trial
// Body: { dias: number }     (suma N días al trial actual; si ya venció, suma desde hoy)
// O:    { nuevoVencimiento: string }   (override absoluto)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) return NextResponse.json({ error: 'Clínica no existe' }, { status: 404 })

  let nuevoVencimiento: Date

  if (body.nuevoVencimiento) {
    const d = new Date(body.nuevoVencimiento)
    if (isNaN(d.getTime())) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
    nuevoVencimiento = d
  } else {
    const dias = Number(body.dias)
    if (!Number.isFinite(dias) || dias <= 0 || dias > 365) {
      return NextResponse.json({ error: 'dias debe ser entre 1 y 365' }, { status: 400 })
    }
    const base = clinica.trialHasta && clinica.trialHasta.getTime() > Date.now()
      ? new Date(clinica.trialHasta)
      : new Date()
    base.setDate(base.getDate() + dias)
    nuevoVencimiento = base
  }

  const data: Record<string, unknown> = {
    trialHasta: nuevoVencimiento,
    activo: true, // re-activar si estaba suspendida
  }
  if (clinica.plan !== 'TRIAL') {
    data.plan = 'TRIAL' // volver a trial cuando extiendes
  }

  const actualizada = await prisma.clinica.update({ where: { id }, data })
  return NextResponse.json({ ok: true, clinica: actualizada })
}
