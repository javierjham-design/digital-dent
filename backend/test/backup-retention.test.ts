import { describe, it, expect } from 'vitest'
import { planificarRetencion, podaConPiso, type ObjetoFechado } from '@/lib/backup/retention'

const PARAMS = { retainDaily: 14, retainWeekly: 8, retainMonthly: 12 }
const NOW = new Date('2026-08-03T07:00:00.000Z')
const DIA = 86400000

// Genera un backup diario por `dias` días hacia atrás desde NOW.
function diarios(dias: number): ObjetoFechado[] {
  return Array.from({ length: dias }, (_, i) => ({
    key: `clariva/dump__${i}.enc`,
    date: new Date(NOW.getTime() - i * DIA),
  }))
}

describe('retención GFS', () => {
  it('conserva todo dentro de la ventana diaria (14 días)', () => {
    const objs = diarios(10)
    const { borrar } = planificarRetencion(objs, NOW, PARAMS)
    expect(borrar).toHaveLength(0) // nada más viejo que 14 días
  })

  it('con 2 años de backups diarios conserva ~14 diarios + 8 semanales + 12 mensuales y borra el resto', () => {
    const objs = diarios(730)
    const { conservar, borrar } = planificarRetencion(objs, NOW, PARAMS)
    // Cota superior holgada: 14 + 8 + 12 = 34 puntos (algún solape puede bajarlo).
    expect(conservar.length).toBeLessThanOrEqual(14 + 8 + 12)
    expect(conservar.length).toBeGreaterThanOrEqual(30)
    expect(conservar.length + borrar.length).toBe(objs.length)
    expect(borrar.length).toBeGreaterThan(680)
  })

  it('conserva los 14 backups más recientes (los del día a día no se tocan)', () => {
    const objs = diarios(730)
    const { conservar } = planificarRetencion(objs, NOW, PARAMS)
    for (let i = 0; i < 14; i++) expect(conservar).toContain(`clariva/dump__${i}.enc`)
  })

  it('NO borra si el resultado dejaría menos de N backups (piso de seguridad)', () => {
    // Dos backups viejísimos (más de un año): la retención los borraría todos,
    // dejando 0 < 3. El piso debe abortar el borrado.
    const objs: ObjetoFechado[] = [
      { key: 'viejo-1.enc', date: new Date(NOW.getTime() - 500 * DIA) },
      { key: 'viejo-2.enc', date: new Date(NOW.getTime() - 400 * DIA) },
    ]
    const sinPiso = planificarRetencion(objs, NOW, PARAMS)
    expect(sinPiso.borrar.length).toBe(2) // sin piso, borraría ambos

    const conPiso = podaConPiso(objs, NOW, PARAMS, 3)
    expect(conPiso.abortadoPorPiso).toBe(true)
    expect(conPiso.borrar).toHaveLength(0) // con piso, no borra nada
  })

  it('el piso NO se activa si quedan suficientes', () => {
    const objs = diarios(730)
    const conPiso = podaConPiso(objs, NOW, PARAMS, 3)
    expect(conPiso.abortadoPorPiso).toBe(false)
    expect(conPiso.borrar.length).toBeGreaterThan(0)
  })
})
