import { describe, it, expect } from 'vitest'
import { dbNameForSlug, assertValidDbName } from '@/lib/provision'

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
