import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { marcarAsistenciaPorActividad, reprogramarCita, listarCitas, crearCita, cambiarEstadoCita } from '@/services/citas.service'

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

describe('reprogramarCita (reagendar preservando historial)', () => {
  it('cancela la original y crea una nueva; ambas quedan en la ficha', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Rea', apellido: 'Genda', activo: true } })
    const orig = await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: new Date('2026-11-02T14:00:00.000Z'), duracion: 30, tipo: 'CONSULTA', notas: 'control', estado: 'CONFIRMADO' } })
    const nuevaFecha = '2026-11-05T16:00:00.000Z'
    const nueva = await reprogramarCita(db, orig.id, 'Recep', { fecha: nuevaFecha })
    // La original queda Cancelada (se conserva en la ficha), con rastro de reprogramación.
    const origUpd = await db.cita.findUnique({ where: { id: orig.id }, select: { estado: true } })
    expect(origUpd?.estado).toBe('CANCELADA')
    expect(await db.citaLog.count({ where: { citaId: orig.id, tipo: 'REAGENDADA' } })).toBe(1)
    // La nueva está Agendada en el nuevo horario y hereda paciente/tipo/notas.
    expect(nueva.id).not.toBe(orig.id)
    expect(nueva.estado).toBe('PENDIENTE')
    expect(new Date(nueva.inicio).toISOString()).toBe(nuevaFecha)
    expect(nueva.notas).toBe('control')
    // La ficha del paciente muestra AMBAS (incluida la cancelada).
    const ficha = await listarCitas(db, { pacienteId: pac.id })
    expect(ficha.length).toBe(2)
    expect(ficha.some((c) => c.estado === 'CANCELADA')).toBe(true)
    expect(ficha.some((c) => c.id === nueva.id && c.estado === 'PENDIENTE')).toBe(true)
  })

  it('no reagenda una cita ya cancelada/atendida', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Ya', apellido: 'Cancel', activo: true } })
    const c = await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: new Date('2026-11-02T14:00:00.000Z'), estado: 'CANCELADA' } })
    await expect(reprogramarCita(db, c.id, 'Recep', { fecha: '2026-11-10T15:00:00.000Z' })).rejects.toThrow(/cancelada/i)
  })
})

describe('agenda: anti doble reserva (Ola 2)', () => {
  it('crearCita rechaza solaparse con una cita existente del mismo doctor', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Sol', apellido: 'Ape', activo: true } })
    await crearCita(db, 'Rec', { pacienteId: pac.id, doctorId, fecha: '2026-12-01T15:00:00.000Z', duracion: 30 })
    await expect(crearCita(db, 'Rec', { pacienteId: pac.id, doctorId, fecha: '2026-12-01T15:15:00.000Z', duracion: 30 }))
      .rejects.toThrow(/ya tiene una cita/i)
    // Sobrecupo sí se permite solaparse.
    const sob = await crearCita(db, 'Rec', { pacienteId: pac.id, doctorId, fecha: '2026-12-01T15:15:00.000Z', duracion: 30, sobrecupo: true })
    expect(sob.estado).toBe('PENDIENTE')
  })

  it('H3: reabrir una cita cancelada rechaza si el cupo fue retomado por otra', async () => {
    const db = tenantClient(dbName)
    const pac = await db.paciente.create({ data: { nombre: 'Reab', apellido: 'Rir', activo: true } })
    const fecha = new Date('2026-12-05T16:00:00.000Z')
    const a = await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha, duracion: 30, estado: 'CANCELADA' } })
    await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha, duracion: 30, estado: 'PENDIENTE' } })
    await expect(cambiarEstadoCita(db, a.id, 'PENDIENTE', 'Rec')).rejects.toThrow(/ya fue tomado/i)
  })
})
