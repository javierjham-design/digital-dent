import { prisma } from '@/lib/prisma'

// Días de antigüedad antes de considerar una sesión "estancada" → alerta al usuario.
export const SESION_STALE_DIAS = 7

/**
 * Devuelve la sesión ABIERTA de una caja. Si no existe, la crea on-the-fly
 * usando como saldo de apertura el saldo REAL de la caja en ese momento
 * (saldoInicial + acumulado de movimientos huérfanos no anulados).
 *
 * El parámetro `userInfo` se usa solo si hay que bootstrap-ear una sesión.
 */
export async function ensureSesionAbierta(args: {
  cajaId: string
  clinicaId: string
  userId: string
  userNombre: string | null
}) {
  const existing = await prisma.sesionCaja.findFirst({
    where: { cajaId: args.cajaId, estado: 'ABIERTA' },
    orderBy: { abiertaAt: 'desc' },
  })
  if (existing) return existing

  // Bootstrap: el punto de partida es el saldo real actual de la caja.
  // Esto incluye cualquier movimiento histórico que no haya quedado asociado a
  // una sesión (legacy data) para que el saldoEsperado siempre cuadre.
  const caja = await prisma.caja.findUnique({
    where: { id: args.cajaId },
    select: { saldoInicial: true },
  })
  const orphans = await prisma.movimientoCaja.findMany({
    where: { cajaId: args.cajaId, sesionCajaId: null, anulado: false },
    select: { tipo: true, monto: true },
  })
  const orphanSaldo = orphans.reduce(
    (s, m) => s + (m.tipo === 'INGRESO' ? m.monto : -m.monto),
    0,
  )
  const saldoApertura = (caja?.saldoInicial ?? 0) + orphanSaldo

  return prisma.sesionCaja.create({
    data: {
      clinicaId: args.clinicaId,
      cajaId: args.cajaId,
      saldoApertura,
      abiertaPorId: args.userId,
      abiertaPorNombre: args.userNombre,
    },
  })
}

/**
 * Resumen acumulado de la sesión: ingresos / egresos / saldo esperado.
 * Captura tanto los movimientos enlazados por sesionCajaId como los huérfanos
 * que cayeron dentro de la ventana temporal de la sesión (defensa en
 * profundidad: si por alguna razón un movimiento no quedó enlazado, igual
 * aparece en el cuadre).
 */
export async function calcularResumenSesion(sesionId: string) {
  const sesion = await prisma.sesionCaja.findUnique({
    where: { id: sesionId },
    select: { saldoApertura: true, abiertaAt: true, cerradaAt: true, cajaId: true },
  })
  if (!sesion) return null
  const hasta = sesion.cerradaAt ?? new Date()
  const movs = await prisma.movimientoCaja.findMany({
    where: {
      cajaId: sesion.cajaId,
      anulado: false,
      OR: [
        { sesionCajaId: sesionId },
        { sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: hasta } },
      ],
    },
    select: { tipo: true, monto: true },
  })
  const ingresos = movs.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
  const egresos  = movs.filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const saldoEsperado = sesion.saldoApertura + ingresos - egresos
  return { ingresos, egresos, saldoEsperado, saldoApertura: sesion.saldoApertura }
}

export function diasDesde(fecha: Date): number {
  const ms = Date.now() - fecha.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}
