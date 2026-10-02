import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { getAutomatizaciones, putAutomatizaciones } from '@/services/automatizaciones.service'

// Centro de Automatizaciones (clínica): comportamiento de recordatorios/no-show/recaptura.
// Las credenciales las pone el Super-Admin; activar recaptura exige WhatsApp conectado.
let A: TenantFixture

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
})

describe('automatizaciones', () => {
  it('get devuelve defaults y put persiste recordatorios/no-show', async () => {
    const db = tenantClient(A.dbName)
    const base = await getAutomatizaciones(db)
    expect(base.noShow.horasAuto).toBe(3)
    expect(base.noShow.diasPerdido).toBe(5)
    const upd = await putAutomatizaciones(db, { recordatoriosHorasAntes: 48, noShowHorasAuto: 2, perdidoDias: 7 })
    expect(upd.recordatorios.horasAntes).toBe(48)
    expect(upd.noShow.horasAuto).toBe(2)
    expect(upd.noShow.diasPerdido).toBe(7)
  })

  it('rechaza valores fuera de rango', async () => {
    const db = tenantClient(A.dbName)
    await expect(putAutomatizaciones(db, { noShowHorasAuto: 999 })).rejects.toThrow()
  })

  it('no deja activar recaptura si WhatsApp no está conectado', async () => {
    const db = tenantClient(A.dbName)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { waEnabled: false } })
    await expect(putAutomatizaciones(db, { recapturaNoShowEnabled: true, waTemplateRecapturaNoShow: 'recaptura_noshow' }))
      .rejects.toThrow(/WhatsApp/)
  })
})
