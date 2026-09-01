import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

// Regresión (incidente Patricio Mora, 2026-09): al eliminar una acción PAGADA, sus
// CobroItem NO deben quedar huérfanos (sin acción ni plan) — deben convertirse en
// ABONO LIBRE del plan (tratamientoId→null, planId=plan) para no perder el dinero.
let A: TenantFixture

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
})

async function armarAccionPagada(planId: string | null) {
  const db = tenantClient(A.dbName)
  const pac = await db.paciente.create({ data: { numero: Math.floor(970000 + Math.random() * 20000), nombre: 'Del', apellido: 'Borrar', activo: true } })
  const ficha = await db.fichaClinica.create({ data: { pacienteId: pac.id } })
  const plan = planId === 'crear' ? await db.planTratamiento.create({ data: { pacienteId: pac.id, nombre: 'Plan X', estado: 'ACTIVO' } }) : null
  const pres = await db.prestacion.create({ data: { nombre: 'Corona', categoria: 'GENERAL', precio: 100000, duracion: 30, activo: true } })
  const trat = await db.tratamiento.create({ data: { fichaId: ficha.id, planId: plan?.id ?? null, prestacionId: pres.id, precio: 100000, estado: 'COMPLETADO' } })
  const cobro = await db.cobro.create({ data: { pacienteId: pac.id, numero: Math.floor(980000 + Math.random() * 20000), concepto: 'Pago corona', monto: 100000, montoNeto: 100000, estado: 'PAGADO' } })
  const item = await db.cobroItem.create({ data: { cobroId: cobro.id, tratamientoId: trat.id, descripcion: 'Corona', monto: 100000 } })
  return { db, trat, item, plan }
}

describe('eliminarTratamiento — no pierde pagos', () => {
  it('convierte los pagos de la acción borrada en abono libre del plan', async () => {
    const { db, trat, item, plan } = await armarAccionPagada('crear')
    const { eliminarTratamiento } = await import('@/services/tratamientos.service')
    await eliminarTratamiento(db, A.adminId, trat.id)

    // La acción se borró…
    expect(await db.tratamiento.findUnique({ where: { id: trat.id } })).toBeNull()
    // …pero el pago NO: quedó como abono libre del plan (no huérfano).
    const after = await db.cobroItem.findUnique({ where: { id: item.id }, select: { tratamientoId: true, planId: true, monto: true } })
    expect(after).toBeTruthy()
    expect(after!.tratamientoId).toBeNull()
    expect(after!.planId).toBe(plan!.id)
    expect(after!.monto).toBe(100000)
  })

  it('bloquea el borrado si la acción tiene pagos y NO está en un plan (no hay dónde reasignar)', async () => {
    const { db, trat } = await armarAccionPagada(null)
    const { eliminarTratamiento } = await import('@/services/tratamientos.service')
    await expect(eliminarTratamiento(db, A.adminId, trat.id)).rejects.toThrow(/plan/i)
    // La acción sigue existiendo (no se borró en silencio perdiendo el pago).
    expect(await db.tratamiento.findUnique({ where: { id: trat.id } })).toBeTruthy()
  })
})
