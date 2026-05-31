import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const isAdmin = u.role === 'admin'
  const isMiembro = caja.usuarios.some(cu => cu.userId === u.id)
  if (!isAdmin && !isMiembro) return NextResponse.json({ error: 'No tienes acceso a esta caja.' }, { status: 403 })

  const sesiones = await prisma.sesionCaja.findMany({
    where: { cajaId: id },
    orderBy: { abiertaAt: 'desc' },
    take: 50,
  })
  return NextResponse.json(sesiones)
}
