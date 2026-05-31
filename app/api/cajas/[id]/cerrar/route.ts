import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { calcularResumenSesion, ensureSesionAbierta } from '@/lib/caja'

// Cierra la sesión abierta actual y abre la siguiente con el saldoReal como
// punto de partida. Quien cierra debe poder operar la caja (asignado o admin).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
  const isAdmin = u.role === 'admin'
  const isMiembro = caja.usuarios.some(cu => cu.userId === u.id)
  if (!isAdmin && !isMiembro) {
    return NextResponse.json({ error: 'No tienes acceso a esta caja.' }, { status: 403 })
  }

  const body = await req.json()
  const saldoReal = Number(body.saldoReal)
  if (!Number.isFinite(saldoReal) || saldoReal < 0) {
    return NextResponse.json({ error: 'El conteo real es inválido.' }, { status: 400 })
  }
  const observaciones = typeof body.observaciones === 'string' ? body.observaciones.trim() : ''

  // Asegurar sesión abierta y calcular resumen
  const sesion = await ensureSesionAbierta({
    cajaId: id,
    clinicaId: u.clinicaId,
    userId: u.id,
    userNombre: u.name ?? u.email,
  })
  const resumen = await calcularResumenSesion(sesion.id)
  if (!resumen) return NextResponse.json({ error: 'No se pudo calcular el resumen' }, { status: 500 })

  const diferencia = saldoReal - resumen.saldoEsperado
  const nombre = u.name ?? u.email ?? 'Sistema'

  // Cerrar la sesión actual y abrir la siguiente con saldoReal como nuevo punto de partida.
  const cerrada = await prisma.$transaction(async (tx) => {
    const closed = await tx.sesionCaja.update({
      where: { id: sesion.id },
      data: {
        estado: 'CERRADA',
        cerradaPorId: u.id,
        cerradaPorNombre: nombre,
        cerradaAt: new Date(),
        saldoEsperado: resumen.saldoEsperado,
        saldoReal,
        diferencia,
        totalIngresos: resumen.ingresos,
        totalEgresos: resumen.egresos,
        observaciones: observaciones || null,
      },
    })
    // Abrir siguiente sesión con saldoReal como saldoApertura
    await tx.sesionCaja.create({
      data: {
        clinicaId: u.clinicaId!,
        cajaId: id,
        saldoApertura: saldoReal,
        abiertaPorId: u.id,
        abiertaPorNombre: nombre,
      },
    })
    return closed
  })

  return NextResponse.json(cerrada)
}
