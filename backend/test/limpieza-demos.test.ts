import { describe, it, expect } from 'vitest'
import { evaluarProductiva } from '@/lib/provision'
import { pareceDemo } from '@/services/demo.service'

// El criterio de "base productiva" (barrera de dropTenantDatabase) y la red de seguridad
// de la limpieza de demos, testeados como funciones puras.

describe('evaluarProductiva — criterio de base productiva', () => {
  it('una DEMO (esDemo=true) NO es productiva, aunque tenga pacientes de seed → se puede borrar', () => {
    expect(evaluarProductiva({ registro: { esDemo: true }, pacientes: 5 })).toBe(false)
    expect(evaluarProductiva({ registro: { esDemo: true }, pacientes: 5000 })).toBe(false) // el flag manda
  })

  it('una CLÍNICA REAL (esDemo=false) es productiva → requiere el flag explícito', () => {
    expect(evaluarProductiva({ registro: { esDemo: false }, pacientes: 0 })).toBe(true)
    expect(evaluarProductiva({ registro: { esDemo: false }, pacientes: 1000 })).toBe(true)
  })

  it('una base HUÉRFANA (sin registro) con pacientes es productiva → requiere el flag', () => {
    expect(evaluarProductiva({ registro: null, pacientes: 10 })).toBe(true)
  })

  it('una base huérfana SIN pacientes (a medio crear) NO es productiva', () => {
    expect(evaluarProductiva({ registro: null, pacientes: 0 })).toBe(false)
  })
})

describe('pareceDemo — red contra el flag mal puesto', () => {
  const creada = new Date('2026-08-01T00:00:00Z')
  const expira7d = new Date('2026-08-08T00:00:00Z') // vida útil de 7 días (un demo normal)

  it('acepta un demo de verdad (pacientes de seed + vida útil ~7 días)', () => {
    expect(pareceDemo({ pacientes: 5, createdAt: creada, demoExpiraEn: expira7d }).ok).toBe(true)
  })

  it('RECHAZA una base con volumen de clínica real, aunque esté marcada demo', () => {
    const r = pareceDemo({ pacientes: 5000, createdAt: creada, demoExpiraEn: expira7d })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/clínica real/)
  })

  it('RECHAZA una base sin demoExpiraEn (no la creó el flujo de demo)', () => {
    expect(pareceDemo({ pacientes: 3, createdAt: creada, demoExpiraEn: null }).ok).toBe(false)
  })

  it('RECHAZA una base cuya vida útil no condice con un demo (creada mucho antes de expirar)', () => {
    const expiraLejos = new Date('2027-08-01T00:00:00Z') // ~1 año de vida útil
    const r = pareceDemo({ pacientes: 3, createdAt: creada, demoExpiraEn: expiraLejos })
    expect(r.ok).toBe(false)
    expect(r.motivo).toMatch(/vida útil/)
  })
})
