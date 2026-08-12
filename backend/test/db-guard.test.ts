import { describe, it, expect } from 'vitest'
import { assertBaseActual, nombreBaseDeUrl } from '@/lib/db-guard'

// Cliente falso: responde current_database() con lo que se le configure.
const fakeDb = (nombre: string) => ({
  $queryRawUnsafe: async () => [{ current_database: nombre }],
})

describe('nombreBaseDeUrl', () => {
  it('extrae el nombre de base del path de la URL', () => {
    expect(nombreBaseDeUrl('postgresql://u:p@host:5432/clariva_t_demo')).toBe('clariva_t_demo')
    expect(nombreBaseDeUrl('postgresql://host/clariva_control?connection_limit=10')).toBe('clariva_control')
  })
  it('devuelve vacío si la URL no es parseable', () => {
    expect(nombreBaseDeUrl('no-es-una-url')).toBe('')
  })
})

describe('assertBaseActual', () => {
  it('pasa cuando la base conectada coincide con la esperada', async () => {
    await expect(assertBaseActual(fakeDb('clariva_t_x'), 'clariva_t_x')).resolves.toBe('clariva_t_x')
  })

  it('aborta cuando la base conectada NO coincide (el susto de operar en otra base)', async () => {
    await expect(assertBaseActual(fakeDb('railway'), 'clariva_t_x')).rejects.toThrow(/conectado a "railway".*se esperaba "clariva_t_x"/)
  })

  it('aborta si la base esperada es una prohibida (default de Railway / vacía)', async () => {
    await expect(assertBaseActual(fakeDb('railway'), 'railway')).rejects.toThrow(/no es un destino válido/)
    await expect(assertBaseActual(fakeDb(''), '')).rejects.toThrow(/no es un destino válido/)
  })
})
