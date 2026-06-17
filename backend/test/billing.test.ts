import { describe, it, expect } from 'vitest'
import {
  getEstadoPago, precioMensualEfectivo, precioPeriodo,
  montoExtrasMensual, precioMensualTotal, calcularProximoCobro, diasParaCobro,
} from '@/lib/billing'

const PRICES = { TRIAL: 0, BASICO: 39900, PRO: 79900 }
const dia = (s: string) => new Date(`${s}T12:00:00.000Z`)
const AHORA = dia('2026-06-17')

describe('getEstadoPago', () => {
  it('clínica inactiva → SUSPENDIDO (gana sobre cualquier plan)', () => {
    expect(getEstadoPago({ plan: 'PRO', activo: false, trialHasta: null, proximoCobro: dia('2026-12-01'), precioAcordado: null }, AHORA)).toBe('SUSPENDIDO')
  })
  it('trial vigente → TRIAL', () => {
    expect(getEstadoPago({ plan: 'TRIAL', activo: true, trialHasta: dia('2026-07-01'), proximoCobro: null, precioAcordado: null }, AHORA)).toBe('TRIAL')
  })
  it('trial vencido → ATRASADO', () => {
    expect(getEstadoPago({ plan: 'TRIAL', activo: true, trialHasta: dia('2026-06-01'), proximoCobro: null, precioAcordado: null }, AHORA)).toBe('ATRASADO')
  })
  it('plan pago con próximo cobro futuro → AL_DIA', () => {
    expect(getEstadoPago({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: dia('2026-07-17'), precioAcordado: null }, AHORA)).toBe('AL_DIA')
  })
  it('plan pago con próximo cobro pasado → ATRASADO', () => {
    expect(getEstadoPago({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: dia('2026-05-17'), precioAcordado: null }, AHORA)).toBe('ATRASADO')
  })
  it('plan pago sin próximo cobro → AL_DIA (asume al día)', () => {
    expect(getEstadoPago({ plan: 'BASICO', activo: true, trialHasta: null, proximoCobro: null, precioAcordado: null }, AHORA)).toBe('AL_DIA')
  })
  it('acepta fechas como string ISO', () => {
    expect(getEstadoPago({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: '2026-07-17T12:00:00.000Z', precioAcordado: null }, AHORA)).toBe('AL_DIA')
  })
})

describe('precioMensualEfectivo', () => {
  it('usa el precio del plan cuando no hay precio acordado', () => {
    expect(precioMensualEfectivo({ plan: 'PRO', precioAcordado: null }, PRICES)).toBe(79900)
  })
  it('el precio acordado sobrescribe al del plan', () => {
    expect(precioMensualEfectivo({ plan: 'PRO', precioAcordado: 50000 }, PRICES)).toBe(50000)
  })
  it('precio acordado de 0 es válido (sobrescribe a gratis)', () => {
    expect(precioMensualEfectivo({ plan: 'PRO', precioAcordado: 0 }, PRICES)).toBe(0)
  })
  it('plan desconocido sin precio acordado → 0', () => {
    expect(precioMensualEfectivo({ plan: 'INEXISTENTE', precioAcordado: null }, PRICES)).toBe(0)
  })
})

describe('precioPeriodo', () => {
  it('mensual = precio mensual', () => {
    expect(precioPeriodo({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: null, precioAcordado: null, cicloFacturacion: 'MENSUAL' }, PRICES)).toBe(79900)
  })
  it('anual = mensual × 12', () => {
    expect(precioPeriodo({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: null, precioAcordado: null, cicloFacturacion: 'ANUAL' }, PRICES)).toBe(79900 * 12)
  })
})

describe('extras', () => {
  it('montoExtrasMensual suma solo los activos', () => {
    expect(montoExtrasMensual([{ montoMensual: 10000, activo: true }, { montoMensual: 5000, activo: false }, { montoMensual: 3000, activo: true }])).toBe(13000)
  })
  it('precioMensualTotal = plan + extras activos', () => {
    expect(precioMensualTotal({ plan: 'BASICO', precioAcordado: null }, PRICES, [{ montoMensual: 10000, activo: true }])).toBe(49900)
  })
})

describe('calcularProximoCobro', () => {
  it('al día: extiende un mes desde el próximo cobro vigente', () => {
    const r = calcularProximoCobro({ proximoActual: dia('2026-07-17'), fechaPago: dia('2026-06-20'), ciclo: 'MENSUAL' })
    expect(r.toISOString().slice(0, 10)).toBe('2026-08-17')
  })
  it('atrasado (próximo cobro pasado): extiende desde la fecha de pago', () => {
    const r = calcularProximoCobro({ proximoActual: dia('2026-05-01'), fechaPago: dia('2026-06-20'), ciclo: 'MENSUAL' })
    expect(r.toISOString().slice(0, 10)).toBe('2026-07-20')
  })
  it('sin fecha previa: extiende desde la fecha de pago', () => {
    const r = calcularProximoCobro({ proximoActual: null, fechaPago: dia('2026-06-20'), ciclo: 'MENSUAL' })
    expect(r.toISOString().slice(0, 10)).toBe('2026-07-20')
  })
  it('ciclo anual extiende un año', () => {
    const r = calcularProximoCobro({ proximoActual: null, fechaPago: dia('2026-06-20'), ciclo: 'ANUAL' })
    expect(r.toISOString().slice(0, 10)).toBe('2027-06-20')
  })
})

describe('diasParaCobro', () => {
  it('trial: días hasta trialHasta', () => {
    expect(diasParaCobro({ plan: 'TRIAL', activo: true, trialHasta: dia('2026-06-27'), proximoCobro: null, precioAcordado: null }, AHORA)).toBe(10)
  })
  it('pago: días hasta proximoCobro', () => {
    expect(diasParaCobro({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: dia('2026-06-24'), precioAcordado: null }, AHORA)).toBe(7)
  })
  it('sin referencia → null', () => {
    expect(diasParaCobro({ plan: 'PRO', activo: true, trialHasta: null, proximoCobro: null, precioAcordado: null }, AHORA)).toBeNull()
  })
})
