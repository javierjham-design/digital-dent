import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { ingresosPorCampana, pagosDePaciente } from '@/services/crm.service'

// Parte A del ROI por campaña: ingreso REAL cobrado atribuido a cada campaña (cobros
// PAGADOS no anulados de los pacientes vinculados a leads CONVERTIDOS). Clínica B.
let dbName = ''

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.B.dbName
})

describe('ingresosPorCampana', () => {
  it('agrupa por campaña y suma solo cobros PAGADOS no anulados de convertidos', async () => {
    const db = tenantClient(dbName)
    // Campaña A: 2 leads, 1 convertido con paciente que pagó 50.000 (+ un cobro anulado que NO cuenta).
    const pacA = await db.paciente.create({ data: { nombre: 'Ana', apellido: 'A', telefono: '+56911110000', activo: true } })
    await db.lead.create({ data: { nombre: 'Ana', estado: 'CONVERTIDO', pacienteId: pacA.id, campana: 'CAMP_A' } })
    await db.lead.create({ data: { nombre: 'Otro', estado: 'NUEVO', campana: 'CAMP_A' } })
    await db.cobro.create({ data: { pacienteId: pacA.id, numero: 7001, concepto: 'c', monto: 50000, estado: 'PAGADO' } })
    await db.cobro.create({ data: { pacienteId: pacA.id, numero: 7002, concepto: 'c', monto: 99999, estado: 'PAGADO', anulado: true } })
    // Campaña B: 1 convertido pero sin cobro pagado (cobro PENDIENTE) → total 0.
    const pacB = await db.paciente.create({ data: { nombre: 'Beto', apellido: 'B', telefono: '+56922220000', activo: true } })
    await db.lead.create({ data: { nombre: 'Beto', estado: 'CONVERTIDO', pacienteId: pacB.id, campana: 'CAMP_B' } })
    await db.cobro.create({ data: { pacienteId: pacB.id, numero: 7003, concepto: 'c', monto: 30000, estado: 'PENDIENTE' } })

    const r = await ingresosPorCampana(db)
    const a = r.campanas.find((c) => c.key === 'CAMP_A')!
    const b = r.campanas.find((c) => c.key === 'CAMP_B')!
    expect(a.leads).toBe(2)
    expect(a.convertidos).toBe(1)
    expect(a.total_cobrado).toBe(50000) // el anulado no suma
    expect(a.pacientes[0]).toMatchObject({ pacienteId: pacA.id, total_cobrado: 50000 })
    expect(b.convertidos).toBe(1)
    expect(b.total_cobrado).toBe(0)
  })
})

describe('pagosDePaciente', () => {
  it('devuelve total cobrado, nº de cobros y si pagó', async () => {
    const db = tenantClient(dbName)
    const p = await db.paciente.create({ data: { nombre: 'Cris', apellido: 'C', activo: true } })
    await db.cobro.create({ data: { pacienteId: p.id, numero: 7101, concepto: 'c', monto: 12000, estado: 'PAGADO' } })
    await db.cobro.create({ data: { pacienteId: p.id, numero: 7102, concepto: 'c', monto: 8000, estado: 'PAGADO' } })
    const r = await pagosDePaciente(db, p.id)
    expect(r.pago).toBe(true)
    expect(r.nro_cobros).toBe(2)
    expect(r.total_cobrado).toBe(20000)
  })
})
