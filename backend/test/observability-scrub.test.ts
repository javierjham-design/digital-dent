import { describe, it, expect } from 'vitest'
import { redactPII } from '@/lib/observability'

describe('redactPII (scrubber de patrones para Sentry)', () => {
  it('redacta RUT chileno (con puntos, con guión, con K)', () => {
    expect(redactPII('paciente 12.345.678-5 no encontrado')).toBe('paciente [rut-redactado] no encontrado')
    expect(redactPII('rut 12345678-5')).toBe('rut [rut-redactado]')
    expect(redactPII('rut 9.876.543-K')).toBe('rut [rut-redactado]')
  })

  it('redacta email', () => {
    expect(redactPII('correo juan.perez@example.cl del lead')).toBe('correo [email-redactado] del lead')
  })

  it('redacta monto en pesos', () => {
    expect(redactPII('total $1.234.567 pendiente')).toBe('total [monto-redactado] pendiente')
    expect(redactPII('$ 2.000.000')).toBe('[monto-redactado]')
  })

  it('redacta varios patrones en un mismo texto', () => {
    const s = 'Falla con RUT 12.345.678-5, email a@b.cl y monto $1.500.000'
    const out = redactPII(s)
    expect(out).not.toMatch(/12\.345\.678/)
    expect(out).not.toContain('a@b.cl')
    expect(out).not.toMatch(/1\.500\.000/)
  })

  it('no toca texto sin PII (no rompe la debuggabilidad)', () => {
    expect(redactPII('connection timeout after 5000 ms at pool.ts:42')).toBe('connection timeout after 5000 ms at pool.ts:42')
  })
})
