import { describe, it, expect } from 'vitest'
import { rangoFechasUtc, wallClockToUtc } from '@/lib/tz'

// Chile: UTC-4 en invierno (julio), UTC-3 en verano (enero, con DST).
describe('rangoFechasUtc (America/Santiago)', () => {
  it('desde = inicio del día local (00:00 Chile → 04:00 UTC en invierno)', () => {
    const { gte } = rangoFechasUtc('2026-07-15', undefined)
    expect(gte?.toISOString()).toBe('2026-07-15T04:00:00.000Z')
  })

  it('hasta = fin del día local (23:59:59.999 Chile → 03:59:59.999 UTC del día siguiente)', () => {
    const { lte } = rangoFechasUtc(undefined, '2026-07-15')
    expect(lte?.toISOString()).toBe('2026-07-16T03:59:59.999Z')
  })

  it('un lead creado a las 22:00 hora Chile cae dentro del rango "hoy"', () => {
    // 22:00 Chile (invierno, UTC-4) = 02:00 UTC del día siguiente.
    const leadCreatedAt = wallClockToUtc('2026-07-15', '22:00')
    expect(leadCreatedAt.toISOString()).toBe('2026-07-16T02:00:00.000Z')
    const { gte, lte } = rangoFechasUtc('2026-07-15', '2026-07-15')
    expect(leadCreatedAt >= gte!).toBe(true)
    expect(leadCreatedAt <= lte!).toBe(true)
  })

  it('respeta el horario de verano (enero, UTC-3)', () => {
    const { gte } = rangoFechasUtc('2026-01-15', undefined)
    expect(gte?.toISOString()).toBe('2026-01-15T03:00:00.000Z')
  })

  it('sin desde/hasta devuelve rango vacío', () => {
    expect(rangoFechasUtc(undefined, undefined)).toEqual({})
  })
})
