import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { encryptNullable } from '@/lib/crypto'
import { emitirTratamientosPendientesTodasLasClinicas } from '@/lib/maintenance'

// Event-driven: Cláriva NO envía WhatsApp; emite el evento patient.treatment_pending a TuBot por
// el webhook de agenda, para los pacientes que asistieron pero no tomaron el tratamiento.
// Idempotente por PlanTratamiento.recapturaAt. Se espía fetch (no pega a TuBot real).
let A: TenantFixture
const fetchCalls: { url: string; body: any }[] = []

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
  await control.clinica.update({ where: { id: A.clinicaId }, data: { activo: true } })
  // Conexión de agenda Cláriva → TuBot activa (es el canal por el que viaja el evento).
  await tenantClient(A.dbName).configuracion.update({
    where: { id: 'singleton' },
    data: { agendaWhEnabled: true, automatizacionesEnabled: true, recapturaTratEnabled: true, agendaWhConnectionId: 'conn_trat', agendaWhSecret: encryptNullable('sekret'), recapturaTratDias: 3 },
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any) => {
    fetchCalls.push({ url: String(url), body: JSON.parse(init?.body ?? '{}') })
    return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) } as any
  }))
})

afterAll(() => { vi.unstubAllGlobals() })

describe('emitirTratamientosPendientesTodasLasClinicas', () => {
  it('emite treatment_pending para un plan sin tomar de un paciente que asistió, y es idempotente', async () => {
    const db = tenantClient(A.dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Eva', apellido: 'Luada', telefono: '+56 9 8888 0001', activo: true } })
    // Asistió a la evaluación.
    await db.cita.create({ data: { pacienteId: pac.id, doctorId: A.adminId, fecha: new Date(Date.now() - 6 * 86400_000), estado: 'ATENDIDA' } })
    // Plan ACTIVO creado hace 5 días, con una acción PLANIFICADA sin pagar ni ejecutar.
    const ficha = await db.fichaClinica.create({ data: { pacienteId: pac.id } })
    const prest = await db.prestacion.create({ data: { nombre: 'Corona', precio: 300000 } })
    const plan = await db.planTratamiento.create({ data: { pacienteId: pac.id, nombre: 'Plan', estado: 'ACTIVO', createdAt: new Date(Date.now() - 5 * 86400_000) } })
    await db.tratamiento.create({ data: { fichaId: ficha.id, planId: plan.id, prestacionId: prest.id, estado: 'PLANIFICADO', precio: 300000, descuento: 0 } })

    fetchCalls.length = 0
    await emitirTratamientosPendientesTodasLasClinicas()
    const mios = fetchCalls.filter((c) => c.body?.event === 'patient.treatment_pending' && c.body?.data?.patient?.phone === '+56 9 8888 0001')
    expect(mios).toHaveLength(1)
    expect(mios[0].body.data.planValue).toBe(300000)
    const up = await db.planTratamiento.findUnique({ where: { id: plan.id }, select: { recapturaAt: true } })
    expect(up?.recapturaAt).toBeInstanceOf(Date)

    // Segunda corrida: no re-emite (recapturaAt sellado).
    fetchCalls.length = 0
    await emitirTratamientosPendientesTodasLasClinicas()
    expect(fetchCalls.filter((c) => c.body?.data?.patient?.phone === '+56 9 8888 0001')).toHaveLength(0)
  })

  it('no emite si el paciente NO asistió a ninguna evaluación', async () => {
    const db = tenantClient(A.dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Noa', apellido: 'Sistio', telefono: '+56 9 8888 0002', activo: true } })
    const ficha = await db.fichaClinica.create({ data: { pacienteId: pac.id } })
    const prest = await db.prestacion.create({ data: { nombre: 'Corona2', precio: 200000 } })
    const plan = await db.planTratamiento.create({ data: { pacienteId: pac.id, nombre: 'Plan2', estado: 'ACTIVO', createdAt: new Date(Date.now() - 5 * 86400_000) } })
    await db.tratamiento.create({ data: { fichaId: ficha.id, planId: plan.id, prestacionId: prest.id, estado: 'PLANIFICADO', precio: 200000, descuento: 0 } })
    fetchCalls.length = 0
    await emitirTratamientosPendientesTodasLasClinicas()
    expect(fetchCalls.filter((c) => c.body?.data?.patient?.phone === '+56 9 8888 0002')).toHaveLength(0)
  })
})
