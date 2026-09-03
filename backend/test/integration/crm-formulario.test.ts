import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

// Lead de Meta Lead Ads: se guarda el NOMBRE del formulario de origen (para
// diferenciar campañas en el CRM) + el form_id.
let A: TenantFixture
beforeAll(async () => { A = (await seedDosClinicas()).A })

describe('ingestarLeadMeta — nombre del formulario', () => {
  it('guarda formularioNombre + formularioId en el lead nuevo', async () => {
    const db = tenantClient(A.dbName)
    const { ingestarLeadMeta } = await import('@/services/crm.service')
    const r = await ingestarLeadMeta(db, {
      nombre: 'Meta', apellido: 'Lead', telefono: '+56911112222',
      leadgenId: 'lg-form-1', formId: 'form-123', formularioNombre: 'Campaña Implantes Septiembre',
    })
    expect(r.lead?.id).toBeTruthy()
    const lead = await db.lead.findUnique({ where: { id: r.lead!.id }, select: { origen: true, formularioNombre: true, formularioId: true, leadgenId: true } })
    expect(lead?.origen).toBe('META_FORM')
    expect(lead?.formularioNombre).toBe('Campaña Implantes Septiembre')
    expect(lead?.formularioId).toBe('form-123')
    expect(lead?.leadgenId).toBe('lg-form-1')
  })

  it('un reingreso por el mismo contacto completa el nombre del formulario del último toque', async () => {
    const db = tenantClient(A.dbName)
    const { ingestarLeadMeta, crearLead } = await import('@/services/crm.service')
    // Contacto previo sin formulario (p. ej. llegó por WhatsApp).
    const previo = await crearLead(db, { nombre: 'Repite', apellido: 'Contacto', telefono: '+56933334444', origen: 'MANUAL' }, { emitirMeta: false })
    const r = await ingestarLeadMeta(db, {
      nombre: 'Repite', apellido: 'Contacto', telefono: '+56933334444',
      leadgenId: 'lg-form-2', formId: 'form-777', formularioNombre: 'Campaña Ortodoncia',
    })
    expect(r.lead?.id).toBe(previo.id) // reingreso, no duplica
    const lead = await db.lead.findUnique({ where: { id: previo.id }, select: { formularioNombre: true, formularioId: true } })
    expect(lead?.formularioNombre).toBe('Campaña Ortodoncia')
    expect(lead?.formularioId).toBe('form-777')
  })
})
