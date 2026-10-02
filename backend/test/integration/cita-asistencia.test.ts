import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { marcarAsistenciaPorActividad } from '@/services/citas.service'

// Parte C: asistencia inferida de forma pasiva. Un pago presencial marca ATENDIDA la cita
// del mismo día del paciente (sin disparar webhooks). Solo promueve desde estados
// pre-asistencia; nunca pisa NO_ASISTIO/ATENDIDA/CANCELADA ni citas de otro día. Clínica B.
let dbName = ''
let doctorId = ''

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.B.dbName
  const db = tenantClient(dbName)
  const doc = await db.user.create({ data: { name: 'Doc Asistencia', role: 'doctor', activo: true, email: 'doc-asist@x.cl', password: 'x' } })
  doctorId = doc.id
})

describe('marcarAsistenciaPorActividad', () => {
  it('marca ATENDIDA la cita del día desde un estado pre-asistencia', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Asi', apellido: 'Tio', activo: true } })
    const cita = await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: new Date(), estado: 'CONFIRMADO' } })
    const ok = await marcarAsistenciaPorActividad(db, pac.id, new Date(), 'pago #1')
    expect(ok).toBe(true)
    const upd = await db.cita.findUnique({ where: { id: cita.id }, select: { estado: true } })
    expect(upd?.estado).toBe('ATENDIDA')
  })

  it('no pisa una cita marcada NO_ASISTIO', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'No', apellido: 'Vino', activo: true } })
    const cita = await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: new Date(), estado: 'NO_ASISTIO' } })
    const ok = await marcarAsistenciaPorActividad(db, pac.id, new Date(), 'pago #2')
    expect(ok).toBe(false)
    const upd = await db.cita.findUnique({ where: { id: cita.id }, select: { estado: true } })
    expect(upd?.estado).toBe('NO_ASISTIO')
  })

  it('ignora citas de otro día', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Otro', apellido: 'Dia', activo: true } })
    const hace10 = new Date(Date.now() - 10 * 86400_000)
    await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: hace10, estado: 'CONFIRMADO' } })
    const ok = await marcarAsistenciaPorActividad(db, pac.id, new Date(), 'pago #3')
    expect(ok).toBe(false)
  })
})
