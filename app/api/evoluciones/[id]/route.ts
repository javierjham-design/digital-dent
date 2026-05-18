import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// DELETE /api/evoluciones/[id] — solo el autor o admin puede borrar
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const evo = await prisma.evolucion.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { id: true, autorId: true },
  })
  if (!evo) return NextResponse.json({ error: 'No existe' }, { status: 404 })

  if (u.role !== 'admin' && evo.autorId !== u.id) {
    return NextResponse.json({ error: 'Sólo el autor o un admin pueden eliminar esta evolución' }, { status: 403 })
  }

  await prisma.evolucion.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
