import { describe, it, expect } from 'vitest'
import { pasosDeGrilla, snapGrid, GRID_MIN } from '@/lib/agenda-grilla'

const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const horas = (ms: number[]) => ms.map(fromMin)

// Regresión del bug real (agenda de bloques de 15 min, Dr. Aedo): antes el paso de la
// grilla era == la duración, así que para ver los huecos de :15/:45 había que pedir
// duración 15 (y entonces la cita reservaba solo 15, pisando consultas de 20). La grilla
// desacopla PASO (bloque 15) de LARGO (duración), arreglando ambos síntomas.
describe('pasosDeGrilla — grilla de 15 desacoplada de la duración', () => {
  it('GRID_MIN = 15', () => expect(GRID_MIN).toBe(15))

  it('cita de 30 en 09:00-10:00 → candidatos cada 15, NO cada 30 (el bug)', () => {
    // Paso 30 daba [09:00, 09:30]; la grilla de 15 recupera 09:15.
    expect(horas(pasosDeGrilla(540, 600, 30))).toEqual(['09:00', '09:15', '09:30'])
  })

  it('cita de 20 (consulta real) alineada a bloques de 15', () => {
    // 09:45+20=10:05 > 10:00 → fuera; quedan 09:00/09:15/09:30.
    expect(horas(pasosDeGrilla(540, 600, 20))).toEqual(['09:00', '09:15', '09:30'])
  })

  it('cita de 15 → cada 15 exacto', () => {
    expect(horas(pasosDeGrilla(540, 600, 15))).toEqual(['09:00', '09:15', '09:30', '09:45'])
  })

  it('cita de 60 → candidatos cada 15, largo 60 mientras calce', () => {
    expect(horas(pasosDeGrilla(540, 660, 60))).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00'])
  })

  it('duración menor al bloque (10) → el paso baja a 10, no fuerza 15', () => {
    expect(horas(pasosDeGrilla(540, 580, 10))).toEqual(['09:00', '09:10', '09:20', '09:30'])
  })

  it('ventana que no alcanza para la cita → vacío', () => {
    expect(pasosDeGrilla(540, 550, 15)).toEqual([])
  })

  it('defensa: duración 0/negativa/NaN o ventana invertida → vacío (sin loop infinito)', () => {
    expect(pasosDeGrilla(540, 600, 0)).toEqual([])
    expect(pasosDeGrilla(540, 600, -5)).toEqual([])
    expect(pasosDeGrilla(540, 600, Number.NaN)).toEqual([])
    expect(pasosDeGrilla(600, 540, 15)).toEqual([])
  })

  it('invariante: ningún candidato + duración se sale de la ventana', () => {
    for (const dur of [10, 15, 20, 30, 45, 60]) {
      for (const m of pasosDeGrilla(585, 840, dur)) {
        expect(m).toBeGreaterThanOrEqual(585)
        expect(m + dur).toBeLessThanOrEqual(840)
      }
    }
  })
})

// Candado de la DURACIÓN a la grilla de 15 (ninguna cita del bot queda en 20/50).
describe('snapGrid — la duración de la cita cae en la grilla de 15', () => {
  it('ya en grilla → no cambia', () => {
    expect(snapGrid(15)).toBe(15)
    expect(snapGrid(30)).toBe(30)
    expect(snapGrid(45)).toBe(45)
    expect(snapGrid(60)).toBe(60)
  })

  it('fuera de grilla → redondea HACIA ARRIBA (nunca sub-reserva)', () => {
    expect(snapGrid(20)).toBe(30) // el bug exacto del caso Andrea
    expect(snapGrid(50)).toBe(60)
    expect(snapGrid(16)).toBe(30)
    expect(snapGrid(31)).toBe(45)
  })

  it('mínimo un bloque: 0/negativo/NaN/menor a 15 → 15', () => {
    expect(snapGrid(0)).toBe(15)
    expect(snapGrid(-5)).toBe(15)
    expect(snapGrid(Number.NaN)).toBe(15)
    expect(snapGrid(1)).toBe(15)
    expect(snapGrid(14)).toBe(15)
  })

  it('invariante: el resultado SIEMPRE es múltiplo de 15, ≥15 y ≥ la duración pedida', () => {
    for (const d of [1, 10, 14, 15, 16, 20, 29, 30, 44, 45, 50, 59, 60, 75, 90, 200]) {
      const r = snapGrid(d)
      expect(r % GRID_MIN).toBe(0)
      expect(r).toBeGreaterThanOrEqual(15)
      expect(r).toBeGreaterThanOrEqual(d)
    }
  })
})
