import { describe, it, expect } from 'vitest'
import { pasosDeGrilla, GRID_MIN } from '@/lib/agenda-grilla'

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
