import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(clinica)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const data: Record<string, unknown> = {}
  for (const k of ['nombre', 'rut', 'direccion', 'ciudad', 'telefono', 'email', 'logoUrl', 'mensajeWA', 'plan', 'activo']) {
    if (k in body) data[k] = body[k]
  }
  if ('trialHasta' in body) data.trialHasta = body.trialHasta ? new Date(body.trialHasta) : null

  const clinica = await prisma.clinica.update({ where: { id }, data })
  return NextResponse.json(clinica)
}
