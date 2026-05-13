import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// GET / PATCH para la clínica del usuario actual (reemplaza /api/configuracion).
export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Sin clínica' }, { status: 401 })
  const clinica = await prisma.clinica.findUnique({ where: { id: u.clinicaId } })
  if (!clinica) return NextResponse.json({ error: 'Clínica no encontrada' }, { status: 404 })
  return NextResponse.json(clinica)
}

export async function PATCH(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Sin clínica' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const data: Record<string, unknown> = {}
  for (const k of ['nombre', 'rut', 'direccion', 'ciudad', 'telefono', 'email', 'logoUrl', 'mensajeWA']) {
    if (k in body) data[k] = body[k]
  }

  const clinica = await prisma.clinica.update({
    where: { id: u.clinicaId },
    data,
  })
  return NextResponse.json(clinica)
}
