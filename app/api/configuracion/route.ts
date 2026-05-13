// DEPRECATED: este endpoint usaba el singleton de Configuracion (single-tenant).
// Se mantiene como pasarela mientras la UI migra a /api/clinica.
// Eliminar tras quitar referencias en configuracion-client.tsx.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const c = await prisma.clinica.findUnique({ where: { id: u.clinicaId } })
  if (!c) return NextResponse.json({ error: 'Clínica no encontrada' }, { status: 404 })
  // Adapta el shape al esperado por el cliente legacy
  return NextResponse.json({
    id: c.id,
    clinica: c.nombre,
    direccion: c.direccion,
    telefono: c.telefono,
    email: c.email,
    ciudad: c.ciudad,
    mensajeWA: c.mensajeWA,
    logoUrl: c.logoUrl,
  })
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.clinica   !== undefined) data.nombre    = body.clinica
  if (body.direccion !== undefined) data.direccion = body.direccion
  if (body.telefono  !== undefined) data.telefono  = body.telefono
  if (body.email     !== undefined) data.email     = body.email
  if (body.ciudad    !== undefined) data.ciudad    = body.ciudad
  if (body.mensajeWA !== undefined) data.mensajeWA = body.mensajeWA
  if (body.logoUrl   !== undefined) data.logoUrl   = body.logoUrl || null

  const c = await prisma.clinica.update({ where: { id: u.clinicaId }, data })
  return NextResponse.json({
    id: c.id,
    clinica: c.nombre,
    direccion: c.direccion,
    telefono: c.telefono,
    email: c.email,
    ciudad: c.ciudad,
    mensajeWA: c.mensajeWA,
    logoUrl: c.logoUrl,
  })
}
