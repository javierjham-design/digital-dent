import { describe, it, expect, beforeAll, vi } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { encryptNullable } from '@/lib/crypto'
import { tubotProvider } from '@/lib/tubot'
import { enviarRecapturasPendientes } from '@/lib/whatsapp'

// Recaptura automática por WhatsApp (día siguiente): no-show → reagendar · plan sin tomar →
// iniciar tratamiento. Sólo pacientes nuevos; idempotente. Se espía el provider (no pega a TuBot).
let B: TenantFixture
const ayer = () => new Date(Date.now() - 24 * 3600_000)
let envios: { templateName: string; to: string }[] = []

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  B = seeded.B
  await control.clinica.update({ where: { id: B.clinicaId }, data: { waEnabled: true, activo: true, esDemo: false } })
  await tenantClient(B.dbName).configuracion.update({
    where: { id: 'singleton' },
    data: {
      waEnabled: true, waApiKey: encryptNullable('cnvk_test'), waTemplateLang: 'es',
      recapturaNoShowEnabled: true, waTemplateRecapturaNoShow: 'recaptura_noshow',
      recapturaTratEnabled: true, waTemplateRecapturaTrat: 'recaptura_tratamiento', recapturaTratDias: 3,
    },
  })
  vi.spyOn(tubotProvider, 'enviarPlantilla').mockImplementation(async (cfg, input) => {
    envios.push({ templateName: cfg.templateName, to: input.to })
    return { messageId: 'mock_' + input.idempotencyKey }
  })
})

describe('recaptura no-show', () => {
  it('paciente nuevo con no-show de ayer → envía una vez y es idempotente', async () => {
    const db = tenantClient(B.dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Nico', apellido: 'NoShow', telefono: '+56 9 7000 0001', activo: true } })
    const cita = await db.cita.create({ data: { pacienteId: pac.id, doctorId: B.adminId, fecha: ayer(), estado: 'NO_ASISTIO' } })
    envios = []
    await enviarRecapturasPendientes()
    expect(envios.filter((e) => e.to === '+56970000001' && e.templateName === 'recaptura_noshow')).toHaveLength(1)
    const up = await db.cita.findUnique({ where: { id: cita.id }, select: { recapturaAt: true } })
    expect(up?.recapturaAt).toBeInstanceOf(Date)
    // Segunda corrida: no reenvía (recapturaAt ya sellado).
    envios = []
    await enviarRecapturasPendientes()
    expect(envios.filter((e) => e.to === '+56970000001')).toHaveLength(0)
  })

  it('paciente recurrente (2+ atendidas) con no-show → NO se recaptura (se marca para no reconsultar)', async () => {
    const db = tenantClient(B.dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Reco', apellido: 'Rrente', telefono: '+56 9 7000 0002', activo: true } })
    await db.cita.createMany({ data: [
      { pacienteId: pac.id, doctorId: B.adminId, fecha: new Date(Date.now() - 10 * 86400_000), estado: 'ATENDIDA' },
      { pacienteId: pac.id, doctorId: B.adminId, fecha: new Date(Date.now() - 20 * 86400_000), estado: 'ATENDIDA' },
    ] })
    const cita = await db.cita.create({ data: { pacienteId: pac.id, doctorId: B.adminId, fecha: ayer(), estado: 'NO_ASISTIO' } })
    envios = []
    await enviarRecapturasPendientes()
    expect(envios.filter((e) => e.to === '+56970000002')).toHaveLength(0)
    const up = await db.cita.findUnique({ where: { id: cita.id }, select: { recapturaAt: true } })
    expect(up?.recapturaAt).toBeInstanceOf(Date) // marcada para no reconsultarla cada corrida
  })
})

describe('recaptura tratamiento', () => {
  it('asistió pero plan sin pago ni ejecución (hace >3 días) → envía y sella el plan', async () => {
    const db = tenantClient(B.dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Eva', apellido: 'Luada', telefono: '+56 9 7000 0003', activo: true } })
    await db.cita.create({ data: { pacienteId: pac.id, doctorId: B.adminId, fecha: new Date(Date.now() - 5 * 86400_000), estado: 'ATENDIDA' } })
    const ficha = await db.fichaClinica.create({ data: { pacienteId: pac.id } })
    const prest = await db.prestacion.create({ data: { nombre: 'Corona', precio: 300000 } })
    const plan = await db.planTratamiento.create({ data: { pacienteId: pac.id, nombre: 'Plan', estado: 'ACTIVO', createdAt: new Date(Date.now() - 5 * 86400_000) } })
    await db.tratamiento.create({ data: { fichaId: ficha.id, planId: plan.id, prestacionId: prest.id, estado: 'PLANIFICADO', precio: 300000, descuento: 0 } })
    envios = []
    await enviarRecapturasPendientes()
    expect(envios.filter((e) => e.to === '+56970000003' && e.templateName === 'recaptura_tratamiento')).toHaveLength(1)
    const up = await db.planTratamiento.findUnique({ where: { id: plan.id }, select: { recapturaAt: true } })
    expect(up?.recapturaAt).toBeInstanceOf(Date)
  })
})
