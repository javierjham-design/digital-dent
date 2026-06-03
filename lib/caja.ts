import { prisma } from '@/lib/prisma'

// Días de antigüedad antes de considerar una sesión "estancada" → alerta al usuario.
export const SESION_STALE_DIAS = 7

/**
 * Devuelve la sesión ABIERTA de una caja, o null si no hay ninguna.
 * No crea sesiones — la apertura es siempre explícita por el usuario.
 */
export async function getSesionAbierta(cajaId: string) {
  return prisma.sesionCaja.findFirst({
    where: { cajaId, estado: 'ABIERTA' },
    orderBy: { abiertaAt: 'desc' },
  })
}

/**
 * Devuelve la última sesión de una caja (abierta o cerrada). Útil para
 * mostrar el "estado actual" de la caja en la UI.
 */
export async function getUltimaSesion(cajaId: string) {
  return prisma.sesionCaja.findFirst({
    where: { cajaId },
    orderBy: { abiertaAt: 'desc' },
  })
}

/**
 * Devuelve la última sesión CERRADA de una caja. Sirve para sugerir el
 * saldo de apertura al abrir una nueva (= saldoReal del último cierre).
 */
export async function getUltimaSesionCerrada(cajaId: string) {
  return prisma.sesionCaja.findFirst({
    where: { cajaId, estado: 'CERRADA' },
    orderBy: { cerradaAt: 'desc' },
  })
}

/**
 * Saldo sugerido al abrir una nueva sesión:
 *   - Si hay sesión cerrada previa: su `saldoReal` (cuadrado al cierre).
 *   - Si no: `saldoInicial` de la caja + saldo neto de movimientos
 *     huérfanos no anulados (legacy sin sesión asociada).
 */
export async function calcularSaldoSugerido(cajaId: string): Promise<number> {
  const ultimaCerrada = await getUltimaSesionCerrada(cajaId)
  if (ultimaCerrada?.saldoReal != null) return ultimaCerrada.saldoReal

  const caja = await prisma.caja.findUnique({
    where: { id: cajaId },
    select: { saldoInicial: true },
  })
  const orphans = await prisma.movimientoCaja.findMany({
    where: { cajaId, sesionCajaId: null, anulado: false },
    select: { tipo: true, monto: true },
  })
  const orphanSaldo = orphans.reduce(
    (s, m) => s + (m.tipo === 'INGRESO' ? m.monto : -m.monto),
    0,
  )
  return (caja?.saldoInicial ?? 0) + orphanSaldo
}

/**
 * Abre una nueva sesión de caja con el saldoApertura declarado.
 * Falla si ya existe una sesión abierta para esa caja.
 */
export async function abrirSesion(args: {
  cajaId: string
  clinicaId: string
  userId: string
  userNombre: string | null
  saldoApertura: number
}) {
  const existing = await getSesionAbierta(args.cajaId)
  if (existing) {
    throw new Error('Ya hay una sesión abierta en esta caja.')
  }
  return prisma.sesionCaja.create({
    data: {
      clinicaId: args.clinicaId,
      cajaId: args.cajaId,
      saldoApertura: args.saldoApertura,
      abiertaPorId: args.userId,
      abiertaPorNombre: args.userNombre,
    },
  })
}

/**
 * Resumen acumulado de una sesión: ingresos / egresos / saldo esperado.
 * Captura tanto los movimientos enlazados por `sesionCajaId` como los
 * huérfanos que cayeron dentro de la ventana temporal (defensa contra
 * movimientos que por alguna razón no quedaron enlazados).
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

export type EstadoCaja = 'ABIERTA' | 'CERRADA' | 'SIN_SESION'

/**
 * Determina el estado de una caja según su última sesión.
 *   - ABIERTA: hay una sesión actualmente abierta.
 *   - CERRADA: la última sesión está cerrada (caja lista para reabrir).
 *   - SIN_SESION: caja nueva, nunca abierta. Necesita primera apertura.
 */
export function estadoDeCaja(ultima: { estado: string } | null | undefined): EstadoCaja {
  if (!ultima) return 'SIN_SESION'
  return ultima.estado === 'ABIERTA' ? 'ABIERTA' : 'CERRADA'
}
