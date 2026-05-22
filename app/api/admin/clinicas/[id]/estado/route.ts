import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// POST /api/admin/clinicas/[id]/estado
// Body: { activo: boolean, notasInternas?: string }
// Suspende o reactiva una clínica. Si se suspende, los usuarios no podrán
// loguear (revisar el flag activo en lib/auth.ts).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body.activo !== 'boolean') {
    return NextResponse.json({ error: 'activo (boolean) requerido' }, { status: 400 })
  }

  const data: Record<string, unknown> = { activo: body.activo }
  if (typeof body.notasInternas === 'string') {
    data.notasInternas = body.notasInternas
  }

  const clinica = await prisma.clinica.update({ where: { id }, data })
  return NextResponse.json({ ok: true, clinica })
}
