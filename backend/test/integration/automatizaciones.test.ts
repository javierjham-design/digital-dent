import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { getAutomatizaciones, putAutomatizaciones } from '@/services/automatizaciones.service'

// Centro de Automatizaciones (clínica): parámetros de detección (no-show / PERDIDO / aviso de
// tratamiento). El envío de WhatsApp lo maneja TuBot; acá no hay plantillas ni toggles de mensajes.
let A: TenantFixture

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
})

describe('automatizaciones', () => {
  it('get devuelve defaults y put persiste detección', async () => {
    const db = tenantClient(A.dbName)
    const base = await getAutomatizaciones(db)
    expect(base.noShow.horasAuto).toBe(3)
    expect(base.noShow.diasPerdido).toBe(5)
    expect(base.tratamiento.diasEspera).toBe(3)
    const upd = await putAutomatizaciones(db, { noShowHorasAuto: 2, perdidoDias: 7, tratamientoDiasEspera: 4 })
    expect(upd.noShow.horasAuto).toBe(2)
    expect(upd.noShow.diasPerdido).toBe(7)
    expect(upd.tratamiento.diasEspera).toBe(4)
  })

  it('rechaza valores fuera de rango', async () => {
    const db = tenantClient(A.dbName)
    await expect(putAutomatizaciones(db, { noShowHorasAuto: 999 })).rejects.toThrow()
    await expect(putAutomatizaciones(db, { tratamientoDiasEspera: 0 })).rejects.toThrow()
  })
})
