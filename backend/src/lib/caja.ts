import type { TenantClient } from '@/db/tenant'

// Días de antigüedad antes de considerar una sesión "estancada" → alerta.
export const SESION_STALE_DIAS = 7

export async function getSesionAbierta(db: TenantClient, cajaId: string) {
  return db.sesionCaja.findFirst({ where: { cajaId, estado: 'ABIERTA' }, orderBy: { abiertaAt: 'desc' } })
}

export async function getUltimaSesion(db: TenantClient, cajaId: string) {
  return db.sesionCaja.findFirst({ where: { cajaId }, orderBy: { abiertaAt: 'desc' } })
}

export async function getUltimaSesionCerrada(db: TenantClient, cajaId: string) {
  return db.sesionCaja.findFirst({ where: { cajaId, estado: 'CERRADA' }, orderBy: { cerradaAt: 'desc' } })
}

// Saldo sugerido al abrir una nueva sesión: el saldoReal del último cierre, o
// saldoInicial de la caja + saldo neto de movimientos huérfanos no anulados.
export async function calcularSaldoSugerido(db: TenantClient, cajaId: string): Promise<number> {
  const ultimaCerrada = await getUltimaSesionCerrada(db, cajaId)
  if (ultimaCerrada?.saldoReal != null) return ultimaCerrada.saldoReal

  const caja = await db.caja.findUnique({ where: { id: cajaId }, select: { saldoInicial: true } })
  const orphans = await db.movimientoCaja.findMany({
    where: { cajaId, sesionCajaId: null, anulado: false }, select: { tipo: true, monto: true },
  })
  const orphanSaldo = orphans.reduce((s, m) => s + (m.tipo === 'INGRESO' ? m.monto : -m.monto), 0)
  return (caja?.saldoInicial ?? 0) + orphanSaldo
}

export async function abrirSesion(db: TenantClient, args: {
  cajaId: string; userId: string; userNombre: string | null; saldoApertura: number
}) {
  const existing = await getSesionAbierta(db, args.cajaId)
  if (existing) throw new Error('Ya hay una sesión abierta en esta caja.')
  return db.sesionCaja.create({
    data: {
      cajaId: args.cajaId, saldoApertura: args.saldoApertura,
      abiertaPorId: args.userId, abiertaPorNombre: args.userNombre,
    },
  })
}

// Resumen acumulado de una sesión: ingresos / egresos / saldo esperado.
export async function calcularResumenSesion(db: TenantClient, sesionId: string) {
  const sesion = await db.sesionCaja.findUnique({
    where: { id: sesionId },
    select: { saldoApertura: true, abiertaAt: true, cerradaAt: true, cajaId: true },
  })
  if (!sesion) return null
  const hasta = sesion.cerradaAt ?? new Date()
  const movs = await db.movimientoCaja.findMany({
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
  const ingresos = movs.filter((m) => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
  const egresos = movs.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const saldoEsperado = sesion.saldoApertura + ingresos - egresos
  return { ingresos, egresos, saldoEsperado, saldoApertura: sesion.saldoApertura }
}

export function diasDesde(fecha: Date): number {
  return Math.floor((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24))
}

export type EstadoCaja = 'ABIERTA' | 'CERRADA' | 'SIN_SESION'

export function estadoDeCaja(ultima: { estado: string } | null | undefined): EstadoCaja {
  if (!ultima) return 'SIN_SESION'
  return ultima.estado === 'ABIERTA' ? 'ABIERTA' : 'CERRADA'
}
