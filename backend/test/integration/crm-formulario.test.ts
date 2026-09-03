import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

// Lead de Meta Lead Ads: guarda el form_id de origen y lo usa como `campana` (sin
// campaña real) para distinguir/renombrar/filtrar por formulario en el CRM.
let A: TenantFixture
beforeAll(async () => { A = (await seedDosClinicas()).A })

describe('ingestarLeadMeta — formulario como campaña', () => {
  it('guarda formularioId y campana = form_id en el lead nuevo', async () => {
    const db = tenantClient(A.dbName)
    const { ingestarLeadMeta } = await import('@/services/crm.service')
    const r = await ingestarLeadMeta(db, {
      nombre: 'Meta', apellido: 'Lead', telefono: '+56911112222',
      leadgenId: 'lg-form-1', formId: '1429532345698706',
    })
    expect(r.lead?.id).toBeTruthy()
    const lead = await db.lead.findUnique({ where: { id: r.lead!.id }, select: { origen: true, formularioId: true, campana: true, leadgenId: true } })
    expect(lead?.origen).toBe('META_FORM')
    expect(lead?.formularioId).toBe('1429532345698706')
    expect(lead?.campana).toBe('1429532345698706')
    expect(lead?.leadgenId).toBe('lg-form-1')
  })

  it('un reingreso por el mismo contacto completa el form_id del último toque', async () => {
    const db = tenantClient(A.dbName)
    const { ingestarLeadMeta, crearLead } = await import('@/services/crm.service')
    const previo = await crearLead(db, { nombre: 'Repite', apellido: 'Contacto', telefono: '+56933334444', origen: 'MANUAL' }, { emitirMeta: false })
    const r = await ingestarLeadMeta(db, {
      nombre: 'Repite', apellido: 'Contacto', telefono: '+56933334444',
      leadgenId: 'lg-form-2', formId: '915928751133277',
    })
    expect(r.lead?.id).toBe(previo.id) // reingreso, no duplica
    const lead = await db.lead.findUnique({ where: { id: previo.id }, select: { formularioId: true } })
    expect(lead?.formularioId).toBe('915928751133277')
  })
})
