import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { ensureSesionAbierta } from '@/lib/caja'

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

  // Asegurar sesión abierta
  const sesion = await ensureSesionAbierta({
    cajaId: id,
    clinicaId: u.clinicaId,
    userId: u.id,
    userNombre: u.name ?? u.email,
  })
  const nombre = u.name ?? u.email ?? 'Sistema'
  const cerradaAt = new Date()
  const clinicaId = u.clinicaId

  // Todo el cierre se hace en una transacción para evitar races con nuevos movimientos.
  const cerrada = await prisma.$transaction(async (tx) => {
    // 1) Back-fill: cualquier movimiento huérfano (sesionCajaId NULL) creado
    //    durante la ventana de la sesión queda asociado a esta sesión, así el
    //    reporte imprimible (que filtra por relación) los muestra correctamente.
    await tx.movimientoCaja.updateMany({
      where: {
        cajaId: id,
        sesionCajaId: null,
        fecha: { gte: sesion.abiertaAt, lte: cerradaAt },
      },
      data: { sesionCajaId: sesion.id },
    })

    // 2) Re-calcular totales DENTRO de la transacción para máxima consistencia.
    const movs = await tx.movimientoCaja.findMany({
      where: { sesionCajaId: sesion.id, anulado: false },
      select: { tipo: true, monto: true },
    })
    const ingresos = movs.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
    const egresos  = movs.filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
    const saldoEsperado = sesion.saldoApertura + ingresos - egresos
    const diferencia = saldoReal - saldoEsperado

    // 3) Cerrar la sesión con los totales reales.
    const closed = await tx.sesionCaja.update({
      where: { id: sesion.id },
      data: {
        estado: 'CERRADA',
        cerradaPorId: u.id,
        cerradaPorNombre: nombre,
        cerradaAt,
        saldoEsperado,
        saldoReal,
        diferencia,
        totalIngresos: ingresos,
        totalEgresos: egresos,
        observaciones: observaciones || null,
      },
    })

    // 4) Abrir la siguiente sesión con saldoReal como saldoApertura.
    await tx.sesionCaja.create({
      data: {
        clinicaId,
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
