import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { getSesionAbierta } from '@/lib/caja'

// Cierra la sesión abierta actual. NO abre una nueva automáticamente:
// la apertura siguiente es siempre un acto explícito del usuario para
// registrar el conteo real de inicio.
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

  const sesion = await getSesionAbierta(id)
  if (!sesion) {
    return NextResponse.json({ error: 'Esta caja no tiene una sesión abierta para cerrar.' }, { status: 409 })
  }
  const nombre = u.name ?? u.email ?? 'Sistema'
  const cerradaAt = new Date()

  // Cierre transaccional: back-fill huérfanos, recomputo totales y cierre.
  const cerrada = await prisma.$transaction(async (tx) => {
    // 1) Back-fill: cualquier movimiento huérfano (sesionCajaId NULL) creado
    //    durante la ventana de la sesión queda asociado a esta sesión, así
    //    el reporte imprimible (que filtra por relación) lo muestra correctamente.
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
    return tx.sesionCaja.update({
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
  })

  return NextResponse.json(cerrada)
}
