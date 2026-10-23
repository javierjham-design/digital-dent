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
    select: { tipo: true, monto: true, cobro: { select: { monto: true, monto2: true, medioPago: { select: { nombre: true } }, medioPago2: { select: { nombre: true } } } } },
  })
  // Sólo el efectivo afecta el saldo físico de caja (ingresos con tarjeta no);
  // un pago dividido aporta solamente su tramo en efectivo.
  const orphanSaldo = orphans.reduce((s, m) => (m.tipo === 'EGRESO' ? s - m.monto : s + efectivoDeIngreso(m)), 0)
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

// Pago DIVIDIDO: monto2 va al segundo medio y el resto (monto − monto2) al primero.
// Clasificar el cobro completo por el medio principal inflaba/deflactaba el efectivo
// esperado del arqueo en cada split que mezclara efectivo con otro medio.
export interface CobroConMedios {
  monto: number; monto2?: number | null
  medioPago: { nombre: string | null } | null
  medioPago2?: { nombre: string | null } | null
}
export function tramosDeCobro(c: CobroConMedios): { nombre: string; monto: number }[] {
  const monto2 = c.monto2 && c.monto2 > 0 ? c.monto2 : 0
  const tramos = [{ nombre: c.medioPago?.nombre || 'Efectivo', monto: c.monto - monto2 }]
  if (monto2 > 0) tramos.push({ nombre: c.medioPago2?.nombre || 'Efectivo', monto: monto2 })
  return tramos
}
// Porción en EFECTIVO de un ingreso (bruto): manual → su monto; cobro → sus tramos efectivo.
export function efectivoDeIngreso(m: { monto: number; cobro: CobroConMedios | null }): number {
  if (!m.cobro) return m.monto
  return tramosDeCobro(m.cobro).reduce((s, t) => (esMedioEfectivo(t.nombre) ? s + t.monto : s), 0)
}

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
    select: { tipo: true, monto: true, cobro: { select: { monto: true, monto2: true, medioPago: { select: { nombre: true } }, medioPago2: { select: { nombre: true } } } } },
  })
  // La caja registra lo EXACTAMENTE cobrado (bruto): si el movimiento viene de un
  // cobro, se usa el monto bruto del cobro (sin descontar la retención del medio,
  // que sólo aplica a liquidaciones). Para movimientos manuales se usa su monto.
  const bruto = (m: { monto: number; cobro: { monto: number } | null }) => m.cobro ? m.cobro.monto : m.monto
  const ingresosMov = movs.filter((m) => m.tipo === 'INGRESO')
  const egresos = movs.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
  const ingresos = ingresosMov.reduce((s, m) => s + bruto(m), 0) // recaudación total (todos los medios)
  // Efectivo por TRAMO: un pago dividido suma al efectivo solo su porción en efectivo.
  const ingresosEfectivo = ingresosMov.reduce((s, m) => s + efectivoDeIngreso(m), 0)
  const ingresosOtros = ingresos - ingresosEfectivo

  // Desglose por método de pago (para el reporte de recaudación), por tramo.
  const map = new Map<string, { monto: number; cantidad: number }>()
  const sumar = (metodo: string, monto: number) => {
    const key = esMedioEfectivo(metodo) ? 'Efectivo' : metodo
    const e = map.get(key) ?? { monto: 0, cantidad: 0 }
    e.monto += monto; e.cantidad++; map.set(key, e)
  }
  for (const m of ingresosMov) {
    if (!m.cobro) { sumar('Efectivo', m.monto); continue }
    for (const t of tramosDeCobro(m.cobro)) sumar(t.nombre, t.monto)
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
