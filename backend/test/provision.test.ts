import { describe, it, expect } from 'vitest'
import { dbNameForSlug, assertValidDbName, columnasFaltantes } from '@/lib/provision'

describe('dbNameForSlug', () => {
  it('deriva un nombre de base válido y determinístico', () => {
    expect(dbNameForSlug('clinica-sonrie')).toBe('clariva_t_clinica_sonrie')
    expect(dbNameForSlug('demo-abc123')).toBe('clariva_t_demo_abc123')
  })
  it('es estable (mismo slug → mismo nombre)', () => {
    expect(dbNameForSlug('mi-clinica')).toBe(dbNameForSlug('mi-clinica'))
  })
  it('normaliza caracteres no permitidos', () => {
    expect(dbNameForSlug('Clínica Ñuñoa!!')).toMatch(/^clariva_t_[a-z0-9_]+$/)
  })
  it('siempre produce un nombre Postgres-válido', () => {
    for (const s of ['a', 'x'.repeat(100), '123', '---', 'AB-CD']) {
      expect(() => assertValidDbName(dbNameForSlug(s))).not.toThrow()
    }
  })
})

describe('columnasFaltantes (self-check de provisión)', () => {
  // Set vacío = ninguna columna existe → faltan TODAS las que el schema declara.
  const todas = columnasFaltantes(new Set())

  it('con la base VACÍA reporta todas las columnas del schema (cientos)', () => {
    // El schema tenant declara varios cientos de columnas; sirve de sanity contra el
    // caso "DDL a medias" (la demo con 491 en vez de 588).
    expect(todas.length).toBeGreaterThan(400)
    expect(todas).toContain('Caja.numero')
    expect(todas).toContain('Paciente.rut')
  })

  it('con TODAS presentes no reporta faltantes', () => {
    expect(columnasFaltantes(new Set(todas))).toEqual([])
  })

  it('detecta una columna faltante puntual', () => {
    const menosUna = new Set(todas.filter((c) => c !== 'Caja.numero'))
    expect(columnasFaltantes(menosUna)).toEqual(['Caja.numero'])
  })

  it('una tabla entera ausente aparece como sus columnas faltantes', () => {
    const sinCaja = new Set(todas.filter((c) => !c.startsWith('Caja.')))
    const faltan = columnasFaltantes(sinCaja)
    expect(faltan).toContain('Caja.numero')
    expect(faltan.every((c) => c.startsWith('Caja.'))).toBe(true)
  })
})

describe('assertValidDbName', () => {
  it('acepta identificadores válidos', () => {
    expect(() => assertValidDbName('clariva_t_demo')).not.toThrow()
  })
  it('rechaza nombres peligrosos o inválidos', () => {
    for (const bad of ['', '1abc', 'has-dash', 'a"; DROP', 'UPPER', 'a'.repeat(64)]) {
      expect(() => assertValidDbName(bad)).toThrow()
    }
  })
})
