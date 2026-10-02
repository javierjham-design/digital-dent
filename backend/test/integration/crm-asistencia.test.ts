import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { propagarAsistenciaLead, reengancharLeadReagenda } from '@/services/citas.service'
import { asistenciaPorCampana, listarNoShowsRecaptura } from '@/services/crm.service'

// Asistencia / no-show → embudo: propagar lead.asistio, idempotencia de recaptura, métrica por
// campaña, lista de no-shows y re-enganche al re-agendar. Clínica B.
let dbName = ''
let doctorId = ''

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.B.dbName
  const db = tenantClient(dbName)
  const doc = await db.user.create({ data: { name: 'Doc Asis', role: 'doctor', activo: true, email: 'doc-asis2@x.cl', password: 'x' } })
  doctorId = doc.id
})

async function leadConCita(estadoCita: string, campana: string) {
  const db = tenantClient(dbName)
  const pac = await db.paciente.create({ data: { nombre: 'P', apellido: campana, activo: true } })
  const cita = await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: new Date(), estado: estadoCita } })
  const lead = await db.lead.create({ data: { nombre: 'P', apellido: campana, telefono: '+56 9 5555 0000', estado: 'AGENDADO', campana, citaId: cita.id, pacienteId: pac.id, fechaAgenda: cita.fecha } })
  return { pac, cita, lead }
}

describe('propagarAsistenciaLead', () => {
  it('no-show propaga lead.asistio=false y sella recapturaNoShowAt una sola vez', async () => {
    const db = tenantClient(dbName)
    const { cita, lead } = await leadConCita('NO_ASISTIO', 'CAMP_NS')
    await propagarAsistenciaLead(db, { id: cita.id, pacienteId: lead.pacienteId! }, false)
    const up1 = await db.lead.findUnique({ where: { id: lead.id }, select: { asistio: true, recapturaNoShowAt: true } })
    expect(up1?.asistio).toBe(false)
    expect(up1?.recapturaNoShowAt).toBeInstanceOf(Date)
    const sello = up1!.recapturaNoShowAt
    // Segunda pasada: no re-dispara (conserva el timestamp original).
    await propagarAsistenciaLead(db, { id: cita.id, pacienteId: lead.pacienteId! }, false)
    const up2 = await db.lead.findUnique({ where: { id: lead.id }, select: { recapturaNoShowAt: true } })
    expect(up2?.recapturaNoShowAt?.getTime()).toBe(sello?.getTime())
  })

  it('asistió propaga lead.asistio=true y limpia la marca de recaptura', async () => {
    const db = tenantClient(dbName)
    const { cita, lead } = await leadConCita('ATENDIDA', 'CAMP_OK')
    await db.lead.update({ where: { id: lead.id }, data: { asistio: false, recapturaNoShowAt: new Date() } })
    await propagarAsistenciaLead(db, { id: cita.id, pacienteId: lead.pacienteId! }, true)
    const up = await db.lead.findUnique({ where: { id: lead.id }, select: { asistio: true, recapturaNoShowAt: true } })
    expect(up?.asistio).toBe(true)
    expect(up?.recapturaNoShowAt).toBeNull()
  })
})

describe('asistenciaPorCampana + no-shows', () => {
  it('agrupa asistencia por campaña y lista los no-shows', async () => {
    const db = tenantClient(dbName)
    const r = await asistenciaPorCampana(db)
    const ns = r.campanas.find((c) => c.key === 'CAMP_NS')!
    expect(ns.agendados).toBeGreaterThanOrEqual(1)
    expect(ns.no_asistio).toBeGreaterThanOrEqual(1)
    expect(ns.tasa_noshow).toBe(100)

    const lista = await listarNoShowsRecaptura(db)
    const row = lista.noShows.find((n) => n.campanaLabel === 'CAMP_NS')
    expect(row).toBeTruthy()
    expect(row?.recaptura_enviada).toBe(true)
    expect(row?.telefono).toBe('+56 9 5555 0000')
  })
})

describe('reengancharLeadReagenda', () => {
  it('un no-show que vuelve a agendar regresa a AGENDADO y limpia asistio/recaptura', async () => {
    const db = tenantClient(dbName)
    const { lead } = await leadConCita('NO_ASISTIO', 'CAMP_RE')
    await db.lead.update({ where: { id: lead.id }, data: { asistio: false, recapturaNoShowAt: new Date() } })
    const nueva = await db.cita.create({ data: { pacienteId: lead.pacienteId!, doctorId, fecha: new Date(Date.now() + 86400_000), estado: 'PENDIENTE' } })
    await reengancharLeadReagenda(db, lead.pacienteId!, nueva.id, nueva.fecha)
    const up = await db.lead.findUnique({ where: { id: lead.id }, select: { estado: true, asistio: true, recapturaNoShowAt: true, citaId: true } })
    expect(up?.estado).toBe('AGENDADO')
    expect(up?.asistio).toBeNull()
    expect(up?.recapturaNoShowAt).toBeNull()
    expect(up?.citaId).toBe(nueva.id)
  })
})
