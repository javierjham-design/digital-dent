import type { TenantClient } from '@/db/tenant'
import { siguienteNumero } from '@/lib/correlativo'
import { advisoryLock } from '@/lib/agenda-lock'

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
  // El saldo de apertura sugerido es lo que quedó en la caja al último cierre
  // (efectivo dejado); si no se registró, el conteo real.
  if (ultimaCerrada?.efectivoDejado != null) return ultimaCerrada.efectivoDejado
  if (ultimaCerrada?.saldoReal != null) return ultimaCerrada.saldoReal

  const caja = await db.caja.findUnique({ where: { id: cajaId }, select: { saldoInicial: true } })
  const orphans = await db.movimientoCaja.findMany({
    where: { cajaId, sesionCajaId: null, anulado: false },
    select: { tipo: true, monto: true, cobro: { select: { medioPago: { select: { nombre: true } } } } },
  })
  // Sólo el efectivo afecta el saldo físico de caja (ingresos con tarjeta no).
  const orphanSaldo = orphans.reduce((s, m) => {
    if (m.tipo === 'EGRESO') return s - m.monto
    return cobroEsEfectivo(m.cobro) ? s + m.monto : s
  }, 0)
  return (caja?.saldoInicial ?? 0) + orphanSaldo
}

export async function abrirSesion(db: TenantClient, args: {
  cajaId: string; userId: string; userNombre: string | null; saldoApertura: number
}) {
  // Lock por CAJA + re-chequeo de "sesión abierta" DENTRO de la transacción: dos aperturas
  // simultáneas de la MISMA caja ya no crean dos sesiones ABIERTA (el lock del correlativo solo
  // serializa el número global, no el check de apertura). El correlativo también va en la tx.
  return db.$transaction(async (tx) => {
    await advisoryLock(tx, `caja:${args.cajaId}`)
    if (await getSesionAbierta(tx as unknown as TenantClient, args.cajaId)) {
      throw new Error('Ya hay una sesión abierta en esta caja.')
    }
    const numero = await siguienteNumero(tx, 'sesionCaja')
    return tx.sesionCaja.create({
      data: {
        numero, cajaId: args.cajaId, saldoApertura: args.saldoApertura,
        abiertaPorId: args.userId, abiertaPorNombre: args.userNombre,
      },
    })
  })
}

// ¿El medio de pago es efectivo (dinero físico)? Sin medio = Efectivo (default).
export const esMedioEfectivo = (nombre?: string | null): boolean => !nombre || /efectivo/i.test(nombre.trim())
// Un movimiento cuenta como EFECTIVO en la caja si es un ingreso sin cobro
// (aporte manual) o el cobro se pagó en efectivo. Tarjetas/transferencias NO.
export const cobroEsEfectivo = (cobro: { medioPago: { nombre: string | null } | null } | null | undefined): boolean =>
  !cobro || !cobro.medioPago || esMedioEfectivo(cobro.medioPago.nombre)

// Resumen acumulado de una sesión. IMPORTANTE: el dinero FÍSICO en caja
// (saldoEsperado/efectivoEsperado) considera SÓLO el efectivo; los pagos con
// tarjeta/transferencia se registran por su medio pero NO suman al efectivo.
export async function calcularResumenSesion(db: TenantClient, sesionId: string) {
  const sesion = await db.sesionCaja.findUnique({
    where: { id: sesionId },
    select: {
      saldoApertura: true, abiertaAt: true, cerradaAt: true, cajaId: true,
      // Para una sesión CERRADA el cuadre quedó CONGELADO al cerrar (ver más abajo).
      estado: true, saldoEsperado: true, totalIngresos: true, totalEgresos: true,
    },
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
    select: { tipo: true, monto: true, cobro: { select: { monto: true, medioPago: { select: { nombre: true } } } } },
  })
  // La caja registra lo EXACTAMENTE cobrado (bruto): si el movimiento viene de un
  // cobro, se usa el monto bruto del cobro (sin descontar la retención del medio,
  // que sólo aplica a liquidaciones). Para movimientos manuales se usa su monto.
  const bruto = (m: { monto: number; cobro: { monto: number } | null }) => m.cobro ? m.cobro.monto : m.monto
  const ingresosMov = movs.filter((m) => m.tipo === 'INGRESO')
  const egresos = movs.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const ingresos = ingresosMov.reduce((s, m) => s + bruto(m), 0) // recaudación total (todos los medios)
  const ingresosEfectivo = ingresosMov.filter((m) => cobroEsEfectivo(m.cobro)).reduce((s, m) => s + bruto(m), 0)
  const ingresosOtros = ingresos - ingresosEfectivo

  // Desglose por método de pago (para el reporte de recaudación).
  const map = new Map<string, { monto: number; cantidad: number }>()
  for (const m of ingresosMov) {
    const metodo = cobroEsEfectivo(m.cobro) ? 'Efectivo' : (m.cobro?.medioPago?.nombre ?? 'Otro')
    const e = map.get(metodo) ?? { monto: 0, cantidad: 0 }
    e.monto += bruto(m); e.cantidad++; map.set(metodo, e)
  }
  const porMetodo = [...map.entries()].map(([metodo, v]) => ({ metodo, ...v })).sort((a, b) => b.monto - a.monto)

  // Sesión CERRADA: el CUADRE (efectivo esperado, ingresos en efectivo y egresos)
  // quedó CONGELADO al cerrar y se devuelve desde los campos sellados, NO recomputado.
  // Si no, editar/anular/borrar un cobro posterior al cierre recalcularía el arqueo y
  // la fila mostraría saldoReal/diferencia contra un esperado que ya no coincide
  // (cierre "auto-contradictorio"). La recaudación total y el desglose por medio sí
  // se recalculan en vivo: son informativos y no afectan el cuadre de efectivo.
  if (sesion.estado === 'CERRADA' && sesion.saldoEsperado != null) {
    const ingresosEfectivoSellado = sesion.totalIngresos ?? ingresosEfectivo
    const egresosSellado = sesion.totalEgresos ?? egresos
    return {
      ingresos, ingresosEfectivo: ingresosEfectivoSellado, ingresosOtros: ingresos - ingresosEfectivoSellado,
      egresos: egresosSellado, saldoEsperado: sesion.saldoEsperado, efectivoEsperado: sesion.saldoEsperado,
      saldoApertura: sesion.saldoApertura, porMetodo,
    }
  }

  const efectivoEsperado = sesion.saldoApertura + ingresosEfectivo - egresos
  // `saldoEsperado` = efectivo esperado (dinero físico), para el cuadre.
  return { ingresos, ingresosEfectivo, ingresosOtros, egresos, saldoEsperado: efectivoEsperado, efectivoEsperado, saldoApertura: sesion.saldoApertura, porMetodo }
}

export function diasDesde(fecha: Date): number {
  return Math.floor((Date.now() - fecha.getTime()) / (1000 * 60 * 60 * 24))
}

export type EstadoCaja = 'ABIERTA' | 'CERRADA' | 'SIN_SESION'

export function estadoDeCaja(ultima: { estado: string } | null | undefined): EstadoCaja {
  if (!ultima) return 'SIN_SESION'
  return ultima.estado === 'ABIERTA' ? 'ABIERTA' : 'CERRADA'
}
