import { describe, it, expect } from 'vitest'
import {
  CITA_ESTADOS, CITA_ESTADOS_KEYS, CITA_ESTADO_LABELS,
  ESTADOS_NO_OCUPAN, siguienteEstado, estadoConfig,
} from '@shared/constants/cita-estados'

describe('catálogo de estados', () => {
  it('expone los 7 estados canónicos', () => {
    expect(CITA_ESTADOS_KEYS).toEqual(['PENDIENTE', 'CONFIRMADA', 'EN_ESPERA', 'EN_ATENCION', 'ATENDIDA', 'NO_ASISTIO', 'CANCELADA'])
  })
  it('cada estado tiene label', () => {
    for (const k of CITA_ESTADOS_KEYS) expect(CITA_ESTADO_LABELS[k]).toBeTruthy()
  })
  it('los estados que no ocupan agenda son cancelada y no-asistió', () => {
    expect(ESTADOS_NO_OCUPAN).toEqual(['CANCELADA', 'NO_ASISTIO'])
  })
})

describe('siguienteEstado (máquina de estados)', () => {
  it('avanza por el flujo de atención', () => {
    expect(siguienteEstado('PENDIENTE')?.estado).toBe('CONFIRMADA')
    expect(siguienteEstado('CONFIRMADA')?.estado).toBe('EN_ESPERA')
    expect(siguienteEstado('EN_ESPERA')?.estado).toBe('EN_ATENCION')
    expect(siguienteEstado('EN_ATENCION')?.estado).toBe('ATENDIDA')
  })
  it('los estados terminales no tienen siguiente', () => {
    expect(siguienteEstado('ATENDIDA')).toBeNull()
    expect(siguienteEstado('NO_ASISTIO')).toBeNull()
    expect(siguienteEstado('CANCELADA')).toBeNull()
  })
  it('cada transición trae una acción descriptiva', () => {
    expect(siguienteEstado('PENDIENTE')?.accion).toBe('Confirmar')
    expect(siguienteEstado('CONFIRMADA')?.accion).toBe('Llegó')
  })
})

describe('estadoConfig', () => {
  it('devuelve la config del estado conocido', () => {
    expect(estadoConfig('ATENDIDA').label).toBe('Atendida')
  })
  it('hace fallback seguro para estados desconocidos', () => {
    const c = estadoConfig('XXX')
    expect(c.label).toBe('XXX')
    expect(c.orden).toBe(99)
  })
})
