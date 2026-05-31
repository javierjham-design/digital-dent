import { prisma } from '@/lib/prisma'

// Días de antigüedad antes de considerar una sesión "estancada" → alerta al usuario.
export const SESION_STALE_DIAS = 7

/**
 * Devuelve la sesión ABIERTA de una caja. Si no existe, la crea on-the-fly
 * usando el saldo inicial de la caja como punto de partida. Idempotente.
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

  // Bootstrap: usamos el saldoInicial de la caja como saldoApertura.
  const caja = await prisma.caja.findUnique({
    where: { id: args.cajaId },
    select: { saldoInicial: true },
  })
  return prisma.sesionCaja.create({
    data: {
      clinicaId: args.clinicaId,
      cajaId: args.cajaId,
      saldoApertura: caja?.saldoInicial ?? 0,
      abiertaPorId: args.userId,
      abiertaPorNombre: args.userNombre,
    },
  })
}

/**
 * Resumen acumulado de la sesión: ingresos / egresos / saldo esperado.
 * Considera solo los movimientos NO anulados.
 */
export async function calcularResumenSesion(sesionId: string) {
  const sesion = await prisma.sesionCaja.findUnique({
    where: { id: sesionId },
    select: { saldoApertura: true },
  })
  if (!sesion) return null
  const movs = await prisma.movimientoCaja.findMany({
    where: { sesionCajaId: sesionId, anulado: false },
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
