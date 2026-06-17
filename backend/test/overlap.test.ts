import { describe, it, expect } from 'vitest'
import { intervalsOverlap, addMinutes } from '@/lib/overlap'

const t = (h: number, m = 0) => new Date(2026, 5, 17, h, m)

describe('intervalsOverlap', () => {
  it('intervalos disjuntos no se solapan', () => {
    expect(intervalsOverlap(t(9), t(9, 30), t(10), t(10, 30))).toBe(false)
  })
  it('intervalos que se tocan en el borde NO se solapan (half-open)', () => {
    expect(intervalsOverlap(t(10), t(10, 30), t(10, 30), t(11))).toBe(false)
    expect(intervalsOverlap(t(10, 30), t(11), t(10), t(10, 30))).toBe(false)
  })
  it('solape parcial (B empieza dentro de A)', () => {
    expect(intervalsOverlap(t(10), t(10, 30), t(10, 15), t(10, 45))).toBe(true)
  })
  it('solape parcial (B termina dentro de A)', () => {
    expect(intervalsOverlap(t(10), t(10, 30), t(9, 45), t(10, 15))).toBe(true)
  })
  it('uno contenido completamente en el otro', () => {
    expect(intervalsOverlap(t(10), t(11), t(10, 15), t(10, 30))).toBe(true)
    expect(intervalsOverlap(t(10, 15), t(10, 30), t(10), t(11))).toBe(true)
  })
  it('intervalos idénticos se solapan', () => {
    expect(intervalsOverlap(t(10), t(10, 30), t(10), t(10, 30))).toBe(true)
  })
  it('es simétrico', () => {
    const a0 = t(10), a1 = t(10, 30), b0 = t(10, 15), b1 = t(10, 45)
    expect(intervalsOverlap(a0, a1, b0, b1)).toBe(intervalsOverlap(b0, b1, a0, a1))
  })
})

describe('addMinutes', () => {
  it('suma minutos sin mutar la fecha original', () => {
    const base = t(10)
    const fin = addMinutes(base, 30)
    expect(fin.getTime() - base.getTime()).toBe(30 * 60_000)
    expect(base.getHours()).toBe(10) // intacta
  })
})
