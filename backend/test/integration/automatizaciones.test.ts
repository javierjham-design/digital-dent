import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { getAutomatizaciones, putAutomatizaciones } from '@/services/automatizaciones.service'

// Gestor de IA (clínica): maestro + flujos (confirmaciones / recaptura no-show / tratamiento) +
// tiempos de detección. El maestro no se puede encender sin TuBot conectado.
let A: TenantFixture

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
})

describe('gestor de IA / automatizaciones', () => {
  it('get devuelve defaults', async () => {
    const db = tenantClient(A.dbName)
    const base = await getAutomatizaciones(db)
    expect(base.maestroActivo).toBe(false)
    expect(base.confirmaciones).toMatchObject({ activo: true, hora1: '12:00', segundaActiva: true, hora2: '18:00' })
    expect(base.noShow).toMatchObject({ activo: false, horasAuto: 3, diasPerdido: 5 })
    expect(base.tratamiento).toMatchObject({ activo: false, diasEspera: 3 })
  })

  it('no deja encender el maestro si TuBot no está conectado', async () => {
    const db = tenantClient(A.dbName)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: false } })
    await expect(putAutomatizaciones(db, { maestroActivo: true })).rejects.toThrow(/TuBot/)
  })

  it('con TuBot conectado persiste maestro + flujos + tiempos', async () => {
    const db = tenantClient(A.dbName)
    await control.clinica.update({ where: { id: A.clinicaId }, data: { waEnabled: true } }).catch(() => {})
    await db.configuracion.update({ where: { id: 'singleton' }, data: { agendaWhEnabled: true, agendaWhConnectionId: 'conn_x' } })
    const upd = await putAutomatizaciones(db, {
      maestroActivo: true, confirmacionesActivo: false, noShowActivo: true, tratamientoActivo: true,
      hora1: '11:00', segundaActiva: true, hora2: '17:30',
      noShowHorasAuto: 2, perdidoDias: 7, tratamientoDiasEspera: 4,
    })
    expect(upd.maestroActivo).toBe(true)
    expect(upd.confirmaciones).toMatchObject({ activo: false, hora1: '11:00', segundaActiva: true, hora2: '17:30' })
    expect(upd.noShow).toMatchObject({ activo: true, horasAuto: 2, diasPerdido: 7 })
    expect(upd.tratamiento).toMatchObject({ activo: true, diasEspera: 4 })
  })

  it('rechaza valores fuera de rango y horarios inválidos', async () => {
    const db = tenantClient(A.dbName)
    await expect(putAutomatizaciones(db, { noShowHorasAuto: 999 })).rejects.toThrow()
    await expect(putAutomatizaciones(db, { hora1: '25:00' })).rejects.toThrow(/HH:MM/)
    await expect(putAutomatizaciones(db, { hora1: '18:00', hora2: '12:00' })).rejects.toThrow(/posterior/)
  })
})
