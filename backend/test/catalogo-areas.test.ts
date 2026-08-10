import { describe, it, expect } from 'vitest'
import { prestacionKey, agruparPrestacionesDuplicadas, AREA_DEFAULT } from '@/services/catalogo.service'

// Blindaje de áreas clínicas (Fase 0): dedupePrestaciones corre en CADA arranque
// sobre TODAS las clínicas. El día que exista una "Consulta" dental y una
// "Consulta" estética en secciones homónimas, NO deben fusionarse. La lógica de
// agrupación es pura y se prueba acá con áreas simuladas (el campo real
// CategoriaPrestacion.area llega en la Fase 1 y alimenta el mismo resolver).

const p = (id: string, nombre: string, categoria: string | null) => ({ id, nombre, categoria })
type P = ReturnType<typeof p>
const todoDental = () => 'DENTAL'

describe('prestacionKey (área + nombre + categoría)', () => {
  it('incluye el área: misma prestación en áreas distintas → claves distintas', () => {
    expect(prestacionKey('Consulta', 'General', 'DENTAL')).not.toBe(prestacionKey('Consulta', 'General', 'ESTETICA'))
  })
  it('normaliza mayúsculas y espacios (comportamiento actual intacto)', () => {
    expect(prestacionKey('  Sellante   Único ', 'prevención')).toBe(prestacionKey('sellante único', 'PREVENCIÓN'))
  })
  it('sin área explícita usa DENTAL (todo lo existente sigue igual)', () => {
    expect(prestacionKey('Corona', 'General')).toBe(prestacionKey('Corona', 'General', AREA_DEFAULT))
  })
})

describe('agruparPrestacionesDuplicadas (la base de dedupePrestaciones)', () => {
  it('dos homónimas de la MISMA área SÍ se agrupan (dedupe actual intacto)', () => {
    const grupos = agruparPrestacionesDuplicadas([p('a', 'Consulta', 'General'), p('b', 'consulta', 'general')], todoDental)
    expect(grupos.length).toBe(1)
    expect(grupos[0].length).toBe(2)
  })

  it('homónimas en secciones de áreas distintas NO se agrupan jamás', () => {
    // "Consultas" (dental) y "Consultas Estética" (estética): el resolver de
    // Fase 1 devuelve el área real de la categoría de cada prestación.
    const areaDe = (it: P) => (it.categoria === 'Consultas' ? 'DENTAL' : 'ESTETICA')
    const grupos = agruparPrestacionesDuplicadas([p('a', 'Consulta', 'Consultas'), p('b', 'Consulta', 'Consultas Estética')], areaDe)
    expect(grupos.length).toBe(0)
  })

  it('secciones HOMÓNIMAS de áreas distintas (mismo string) → tampoco fusiona', () => {
    // Caso límite: dos secciones "General", una dental y una estética. Por eso el
    // resolver es POR PRESTACIÓN (en Fase 1, vía categoriaId): el nombre solo no
    // alcanza para decidir el área.
    const areaPorId = new Map([['a', 'DENTAL'], ['b', 'ESTETICA']])
    const areaDe = (it: P) => areaPorId.get(it.id) ?? AREA_DEFAULT
    const grupos = agruparPrestacionesDuplicadas([p('a', 'Consulta', 'General'), p('b', 'Consulta', 'General')], areaDe)
    expect(grupos.length).toBe(0)
  })

  it('no agrupa nombres distintos aunque compartan área y sección', () => {
    const grupos = agruparPrestacionesDuplicadas([p('a', 'Consulta', 'General'), p('b', 'Control', 'General')], todoDental)
    expect(grupos.length).toBe(0)
  })
})
