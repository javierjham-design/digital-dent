import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { compilar, type Consulta } from '@/services/asistente/compilador'
import { CLINIC_TZ, wallClockToUtc } from '@/lib/tz'

// Preguntas doradas de la capa semántica (etapa 3): corren el compilador DIRECTO
// (sin modelo) sobre datos de valores conocidos. Es la suite que detecta si una
// definición de negocio cambió sin querer. Fixtures en la clínica B (la A la usa
// asistente.test.ts). Fechas en hora de Chile.
let dbName = ''
let pacA = '', pacB = '', docId = '', medioId = ''

const at = (ymd: string) => wallClockToUtc(ymd, '12:00', CLINIC_TZ)
function q(p: Partial<Consulta> & Pick<Consulta, 'metrica'>): Consulta {
  return { dimensiones: [], filtros: [], orden: 'desc', limite: 100, periodo: { desde: '2026-09-01', hasta: '2026-09-30' }, ...p }
}
async function filas(c: Consulta) { return (await compilar(tenantClient(dbName), c, CLINIC_TZ)).filas }

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.B.dbName
  const db = tenantClient(dbName)
  const doc = await db.user.findFirst({ where: { role: 'doctor' }, select: { id: true } })
  docId = doc!.id
  const a = await db.paciente.create({ data: { nombre: 'PacUno', apellido: 'Test', activo: true } })
  const b = await db.paciente.create({ data: { nombre: 'PacDos', apellido: 'Test', activo: true } })
  pacA = a.id; pacB = b.id
  const medio = await db.medioPago.create({ data: { nombre: 'Efectivo' } })
  medioId = medio.id

  // Citas — Sept: pacA 1 (realizada); pacB 3 (2 realizadas, 1 cancelada). Agosto: pacA 1 (fuera de rango).
  await db.cita.createMany({ data: [
    { pacienteId: pacA, doctorId: docId, fecha: at('2026-09-10'), estado: 'REALIZADA' },
    { pacienteId: pacB, doctorId: docId, fecha: at('2026-09-11'), estado: 'REALIZADA' },
    { pacienteId: pacB, doctorId: docId, fecha: at('2026-09-12'), estado: 'REALIZADA' },
    { pacienteId: pacB, doctorId: docId, fecha: at('2026-09-13'), estado: 'CANCELADA' },
    { pacienteId: pacA, doctorId: docId, fecha: at('2026-08-20'), estado: 'REALIZADA' },
  ] })

  // Cobros — 2 PAGADO en Sept (100k + 50k = 150k); 1 PENDIENTE excluido.
  await db.cobro.create({ data: { pacienteId: pacA, numero: 1, concepto: 't', monto: 100000, estado: 'PAGADO', medioPagoId: medioId, fechaPago: at('2026-09-10') } })
  await db.cobro.create({ data: { pacienteId: pacB, numero: 2, concepto: 't', monto: 50000, estado: 'PAGADO', medioPagoId: medioId, fechaPago: at('2026-09-15') } })
  await db.cobro.create({ data: { pacienteId: pacA, numero: 3, concepto: 't', monto: 999999, estado: 'PENDIENTE' } })

  // Leads — Sept: 2 NUEVO (FORMULARIO), 1 CONTACTADO (META_FORM).
  await db.lead.createMany({ data: [
    { nombre: 'L1', estado: 'NUEVO', origen: 'FORMULARIO', createdAt: at('2026-09-05') },
    { nombre: 'L2', estado: 'NUEVO', origen: 'FORMULARIO', createdAt: at('2026-09-06') },
    { nombre: 'L3', estado: 'CONTACTADO', origen: 'META_FORM', createdAt: at('2026-09-07') },
  ] })

  // Planes — 2 ACTIVO en Sept.
  await db.planTratamiento.create({ data: { pacienteId: pacA, estado: 'ACTIVO', createdAt: at('2026-09-02') } })
  await db.planTratamiento.create({ data: { pacienteId: pacB, estado: 'ACTIVO', createdAt: at('2026-09-03') } })

  // Tratamientos ejecutados — 2 COMPLETADO en Sept; neto 180k (200k−10%) + 100k = 280k.
  const ficha = await db.fichaClinica.create({ data: { pacienteId: pacA } })
  const prest = await db.prestacion.create({ data: { nombre: 'Prest', precio: 200000 } })
  await db.tratamiento.create({ data: { fichaId: ficha.id, prestacionId: prest.id, doctorId: docId, estado: 'COMPLETADO', precio: 200000, descuento: 10, fechaCompletado: at('2026-09-10') } })
  await db.tratamiento.create({ data: { fichaId: ficha.id, prestacionId: prest.id, doctorId: docId, estado: 'COMPLETADO', precio: 100000, descuento: 0, fechaCompletado: at('2026-09-11') } })
})

const valorDe = (fs: Record<string, unknown>[], pred: (f: Record<string, unknown>) => boolean) => Number(fs.find(pred)?.valor ?? NaN)

describe('preguntas doradas — citas', () => {
  it('pacientes con EXACTAMENTE 1 cita en septiembre (la pregunta del usuario)', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', dimensiones: ['paciente'], filtroValor: { op: 'eq', valor: 1 } }))
    expect(fs).toHaveLength(1)
    expect(fs[0].paciente).toBe(pacA)
    expect(fs[0].valor).toBe(1)
  })
  it('pacientes con al menos 2 citas → pacB (3)', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', dimensiones: ['paciente'], filtroValor: { op: 'gte', valor: 2 } }))
    expect(fs).toHaveLength(1)
    expect(fs[0].paciente).toBe(pacB); expect(fs[0].valor).toBe(3)
  })
  it('total de citas en septiembre = 4 (agosto excluido)', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad' }))
    expect(fs[0].valor).toBe(4)
  })
  it('canceladas en septiembre = 1', async () => {
    const fs = await filas(q({ metrica: 'citas_canceladas' }))
    expect(fs[0].valor).toBe(1)
  })
  it('por estado: REALIZADA=3, CANCELADA=1', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', dimensiones: ['estado'] }))
    expect(valorDe(fs, (f) => f.estado === 'REALIZADA')).toBe(3)
    expect(valorDe(fs, (f) => f.estado === 'CANCELADA')).toBe(1)
  })
  it('por profesional: el doctor tiene 4', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', dimensiones: ['profesional'] }))
    expect(fs[0].valor).toBe(4)
  })
  it('por mes (ago–sep): 2026-09=4, 2026-08=1', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', dimensiones: ['mes'], periodo: { desde: '2026-08-01', hasta: '2026-09-30' } }))
    expect(valorDe(fs, (f) => f.mes === '2026-09')).toBe(4)
    expect(valorDe(fs, (f) => f.mes === '2026-08')).toBe(1)
  })
  it('filtro estado=REALIZADA → 3', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', filtros: [{ campo: 'estado', op: 'eq', valor: 'REALIZADA' }] }))
    expect(fs[0].valor).toBe(3)
  })
  it('orden asc + límite 1 por paciente → el de menor (1)', async () => {
    const fs = await filas(q({ metrica: 'citas_cantidad', dimensiones: ['paciente'], orden: 'asc', limite: 1 }))
    expect(fs).toHaveLength(1); expect(fs[0].valor).toBe(1)
  })
})

describe('preguntas doradas — dinero y otros', () => {
  it('cobros_total septiembre = 150.000 (anulado/pendiente excluido)', async () => {
    const fs = await filas(q({ metrica: 'cobros_total' }))
    expect(fs[0].valor).toBe(150000)
  })
  it('cobros_cantidad = 2', async () => {
    const fs = await filas(q({ metrica: 'cobros_cantidad' }))
    expect(fs[0].valor).toBe(2)
  })
  it('cobros_total por medio de pago → Efectivo 150.000', async () => {
    const fs = await filas(q({ metrica: 'cobros_total', dimensiones: ['medio_pago'] }))
    expect(valorDe(fs, (f) => f.medio_pago === 'Efectivo')).toBe(150000)
  })
  it('leads_cantidad = 3; por estado NUEVO=2; por origen FORMULARIO=2', async () => {
    expect((await filas(q({ metrica: 'leads_cantidad' })))[0].valor).toBe(3)
    expect(valorDe(await filas(q({ metrica: 'leads_cantidad', dimensiones: ['estado'] })), (f) => f.estado === 'NUEVO')).toBe(2)
    expect(valorDe(await filas(q({ metrica: 'leads_cantidad', dimensiones: ['origen'] })), (f) => f.origen === 'FORMULARIO')).toBe(2)
  })
  it('planes_cantidad = 2 (ACTIVO)', async () => {
    expect((await filas(q({ metrica: 'planes_cantidad' })))[0].valor).toBe(2)
  })
  it('tratamientos_ejecutados = 2', async () => {
    expect((await filas(q({ metrica: 'tratamientos_ejecutados' })))[0].valor).toBe(2)
  })
  it('tratamientos_monto (neto) = 280.000', async () => {
    expect((await filas(q({ metrica: 'tratamientos_monto' })))[0].valor).toBe(280000)
  })
  it('métrica inexistente → error', async () => {
    await expect(filas(q({ metrica: 'no_existe' }))).rejects.toThrow()
  })
  it('dimensión no permitida → error', async () => {
    await expect(filas(q({ metrica: 'leads_cantidad', dimensiones: ['profesional'] }))).rejects.toThrow()
  })
})
