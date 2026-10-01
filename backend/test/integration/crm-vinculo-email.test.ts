import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { autolinkLeadAlCrearPaciente, marcarConvertidoPorCobro, leadsSinVincularPorIdentidad } from '@/services/crm.service'

// Etapa 2 del fix de atribución: el match lead→paciente ahora usa EMAIL además de
// teléfono/RUT, y un cobro pagado intenta vincular el lead si faltaba. Clínica B.
let dbName = ''

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.B.dbName
})

describe('vínculo lead→paciente por email', () => {
  it('autolink al crear ficha: vincula por EMAIL cuando no hay teléfono ni RUT', async () => {
    const db = tenantClient(dbName)
    const lead = await db.lead.create({ data: { nombre: 'Lia', email: 'lia@correo.com', estado: 'NUEVO' } })
    const pac = await db.paciente.create({ data: { nombre: 'Lia', apellido: 'Pérez', email: 'LIA@correo.com', activo: true } })
    const r = await autolinkLeadAlCrearPaciente(db, { id: pac.id, telefono: null, email: pac.email, rut: null })
    expect(r.vinculado).toBe(true)
    const upd = await db.lead.findUnique({ where: { id: lead.id }, select: { pacienteId: true } })
    expect(upd?.pacienteId).toBe(pac.id)
  })

  it('leadsSinVincularPorIdentidad encuentra por email', async () => {
    const db = tenantClient(dbName)
    await db.lead.create({ data: { nombre: 'Bob', email: 'bob@correo.com', estado: 'NUEVO' } })
    const matches = await leadsSinVincularPorIdentidad(db, null, 'bob@correo.com', null)
    expect(matches).toHaveLength(1)
    expect(matches[0].email).toBe('bob@correo.com')
  })

  it('cobro pagado vincula el lead huérfano por email y lo marca CONVERTIDO', async () => {
    const db = tenantClient(dbName)
    const lead = await db.lead.create({ data: { nombre: 'Cris', email: 'cris@correo.com', estado: 'NUEVO' } })
    const pac = await db.paciente.create({ data: { nombre: 'Cris', apellido: 'Soto', email: 'cris@correo.com', activo: true } })
    await db.cobro.create({ data: { pacienteId: pac.id, numero: 9001, concepto: 't', monto: 50000, estado: 'PAGADO' } })
    await marcarConvertidoPorCobro(db, pac.id, 'test')
    const upd = await db.lead.findUnique({ where: { id: lead.id }, select: { pacienteId: true, estado: true } })
    expect(upd?.pacienteId).toBe(pac.id)
    expect(upd?.estado).toBe('CONVERTIDO')
  })

  it('no adivina: dos leads con el mismo email no se auto-vinculan por cobro', async () => {
    const db = tenantClient(dbName)
    await db.lead.create({ data: { nombre: 'Dup1', email: 'dup@correo.com', estado: 'NUEVO' } })
    await db.lead.create({ data: { nombre: 'Dup2', email: 'dup@correo.com', estado: 'NUEVO' } })
    const pac = await db.paciente.create({ data: { nombre: 'Dup', apellido: 'X', email: 'dup@correo.com', activo: true } })
    await db.cobro.create({ data: { pacienteId: pac.id, numero: 9002, concepto: 't', monto: 1000, estado: 'PAGADO' } })
    await marcarConvertidoPorCobro(db, pac.id, 'test')
    const vinc = await db.lead.count({ where: { email: 'dup@correo.com', pacienteId: pac.id } })
    expect(vinc).toBe(0) // ambiguo → ninguno se vincula (queda el aviso en la ficha)
  })
})
