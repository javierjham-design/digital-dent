import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { hashApiKey } from '@/services/ext.service'
import { todayYmd, addDaysYmd, wallClockToUtc } from '@/lib/tz'

// API de agenda que consume TuBot. Auth por token dedicado (Clinica.tubotApiKeyHash).
// Paths exactos del contrato bajo /api/v1. Fase 1 (catálogo) + Fase 2 (disponibilidad).
let app: Express
let A: TenantFixture
let doctorId = ''
let prestacionId = ''
const TOKEN = 'tbk_test_agenda'
const get = (url: string, token = TOKEN) => request(app).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`)
const post = (url: string, body: unknown, key?: string) => {
  let r = request(app).post(`/api/v1${url}`).set('Authorization', `Bearer ${TOKEN}`)
  if (key) r = r.set('Idempotency-Key', key)
  return r.send(body)
}
const patch = (url: string, body: unknown) => request(app).patch(`/api/v1${url}`).set('Authorization', `Bearer ${TOKEN}`).send(body)
const put = (url: string, body: unknown) => request(app).put(`/api/v1${url}`).set('Authorization', `Bearer ${TOKEN}`).send(body)

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
  const { createApp } = await import('@/app')
  app = createApp()
  // Token dedicado de TuBot para la clínica A.
  await control.clinica.update({ where: { id: A.clinicaId }, data: { tubotApiKeyHash: hashApiKey(TOKEN) } })
  // Un doctor + categoría dental + prestación en la base de A.
  const db = tenantClient(A.dbName)
  const doc = await db.user.create({ data: { name: 'Test Uno', titulo: 'Dr.', role: 'doctor', activo: true, especialidad: 'Odontología', email: 'doc-tubot@x.cl', password: 'x', areaDental: true } })
  doctorId = doc.id
  const cat = await db.categoriaPrestacion.create({ data: { nombre: 'Prevención TuBot', area: 'DENTAL' } })
  const pres = await db.prestacion.create({ data: { nombre: 'Limpieza dental', precio: 15000, duracion: 30, activo: true, categoriaId: cat.id } })
  prestacionId = pres.id
  // Horario 09:00–17:00 todos los días (para tener slots en cualquier día que corra el test).
  await db.horarioDoctor.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ doctorId, diaSemana, horaInicio: '09:00', horaFin: '17:00', activo: true, recesoActivo: false, sobrecupoActivo: false })) })
})

describe('TuBot agenda — auth', () => {
  it('sin token → 401', async () => {
    const r = await request(app).get('/api/v1/clinics')
    expect(r.status).toBe(401)
  })
  it('token inválido → 401', async () => {
    const r = await get('/clinics', 'tbk_malo')
    expect(r.status).toBe(401)
  })
})

describe('TuBot agenda — catálogo (Fase 1)', () => {
  it('GET /clinics → la clínica como única sede', async () => {
    const r = await get('/clinics')
    expect(r.status).toBe(200)
    expect(r.body).toHaveLength(1)
    expect(r.body[0].id).toBe(A.slug)
    expect(r.body[0].timezone).toBe('America/Santiago')
    expect(typeof r.body[0].name).toBe('string')
  })

  it('GET /professionals → doctores activos con especialidad y clinicIds', async () => {
    const r = await get('/professionals')
    expect(r.status).toBe(200)
    const p = r.body.find((x: { id: string }) => x.id === doctorId)
    expect(p).toBeTruthy()
    expect(p.name).toContain('Test Uno')
    expect(p.specialty).toBe('Odontología')
    expect(p.clinicIds).toEqual([A.slug])
  })

  it('GET /services → prestaciones activas con durationMin/price/currency', async () => {
    const r = await get('/services')
    expect(r.status).toBe(200)
    const s = r.body.find((x: { name: string }) => x.name === 'Limpieza dental')
    expect(s).toBeTruthy()
    expect(s.durationMin).toBe(30)
    expect(s.price).toBe(15000)
    expect(s.currency).toBe('CLP')
  })

  it('GET /professionals/:id/services → prestaciones del área del doctor', async () => {
    const r = await get(`/professionals/${doctorId}/services`)
    expect(r.status).toBe(200)
    expect(r.body.some((x: { name: string }) => x.name === 'Limpieza dental')).toBe(true)
  })
})

describe('TuBot agenda — disponibilidad (Fase 2)', () => {
  it('GET /availability → slots de 30 min con clinicId/professionalId', async () => {
    const from = todayYmd()
    const to = addDaysYmd(from, 5)
    const r = await get(`/availability?professionalId=${doctorId}&from=${from}&to=${to}`)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body)).toBe(true)
    expect(r.body.length).toBeGreaterThan(0)
    const s = r.body[0]
    expect(s.professionalId).toBe(doctorId)
    expect(s.clinicId).toBe(A.slug)
    expect((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000).toBe(30)
    // Todos a futuro y ordenados ascendente.
    expect(new Date(s.start).getTime()).toBeGreaterThan(Date.now())
    const starts = r.body.map((x: { start: string }) => x.start)
    expect(starts).toEqual([...starts].sort())
  })

  it('GET /availability?serviceId → incluye el serviceId en cada slot', async () => {
    const from = todayYmd()
    const to = addDaysYmd(from, 2)
    const r = await get(`/availability?serviceId=${prestacionId}&from=${from}&to=${to}`)
    expect(r.status).toBe(200)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body.every((x: { serviceId: string }) => x.serviceId === prestacionId)).toBe(true)
  })

  it('GET /availability → una cita que ocupa saca su slot', async () => {
    const db = tenantClient(A.dbName)
    const from = addDaysYmd(todayYmd(), 1) // mañana, para no chocar con "ya pasó"
    const inicio = wallClockToUtc(from, '09:00')
    const pac = await db.paciente.create({ data: { numero: 90001, nombre: 'Bloqueo', apellido: 'Test', activo: true } })
    await db.cita.create({ data: { pacienteId: pac.id, doctorId, fecha: inicio, duracion: 30, tipo: 'EVALUACION', estado: 'PENDIENTE', origen: 'MANUAL' } })
    const r = await get(`/availability?professionalId=${doctorId}&from=${from}&to=${from}`)
    expect(r.status).toBe(200)
    expect(r.body.some((x: { start: string }) => x.start === inicio.toISOString())).toBe(false)
    // El slot siguiente (09:30) sí debe estar libre.
    expect(r.body.some((x: { start: string }) => x.start === new Date(inicio.getTime() + 30 * 60000).toISOString())).toBe(true)
  })
})

describe('TuBot agenda — citas (Fase 3)', () => {
  let apptId = ''
  const phone = '+56987654321'
  const day = addDaysYmd(todayYmd(), 2)
  const start = wallClockToUtc(day, '10:00').toISOString()
  const end = wallClockToUtc(day, '10:30').toISOString()

  it('POST /appointments → 201 con SchedAppointment (crea paciente)', async () => {
    const r = await post('/appointments', { clinicId: A.slug, professionalId: doctorId, serviceId: prestacionId, start, end, patient: { firstName: 'Ana', lastName: 'Bot', phone, email: 'ana@x.cl' } })
    expect(r.status).toBe(201)
    expect(r.body.id).toBeTruthy()
    expect(r.body.professionalId).toBe(doctorId)
    expect(r.body.clinicId).toBe(A.slug)
    expect(r.body.serviceId).toBe(prestacionId)
    expect(r.body.status).toBe('pending')
    expect(r.body.start).toBe(start)
    expect(r.body.patient.phone).toContain('987654321')
    apptId = r.body.id
  })

  it('POST con Idempotency-Key repetido → misma cita', async () => {
    const payload = { professionalId: doctorId, start: wallClockToUtc(day, '11:00').toISOString(), end: wallClockToUtc(day, '11:30').toISOString(), patient: { firstName: 'Ivo', lastName: 'Test', phone: '+56911112222' } }
    const r1 = await post('/appointments', payload, 'idem-123')
    const r2 = await post('/appointments', payload, 'idem-123')
    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(r2.body.id).toBe(r1.body.id)
  })

  it('POST mismo slot ocupado → 409 slot_taken', async () => {
    const r = await post('/appointments', { professionalId: doctorId, start, end, patient: { firstName: 'Otro', lastName: 'Choca', phone: '+56900000000' } })
    expect(r.status).toBe(409)
    expect(r.body.error).toBe('slot_taken')
  })

  it('GET /appointments/:id', async () => {
    const r = await get(`/appointments/${apptId}`)
    expect(r.status).toBe(200)
    expect(r.body.id).toBe(apptId)
    expect(r.body.patient.firstName).toBe('Ana')
  })

  it('GET /appointments/:id inexistente → 404', async () => {
    const r = await get('/appointments/no-existe')
    expect(r.status).toBe(404)
  })

  it('POST /confirm → confirmed', async () => {
    const r = await post(`/appointments/${apptId}/confirm`, {})
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('confirmed')
  })

  it('PATCH /appointments/:id reagenda (vuelve a pending)', async () => {
    const ns = wallClockToUtc(day, '15:00').toISOString()
    const ne = wallClockToUtc(day, '15:30').toISOString()
    const r = await patch(`/appointments/${apptId}`, { start: ns, end: ne })
    expect(r.status).toBe(200)
    expect(r.body.start).toBe(ns)
    expect(r.body.status).toBe('pending')
  })

  it('POST /attendance attended:false → no_show', async () => {
    const r = await post(`/appointments/${apptId}/attendance`, { attended: false })
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('no_show')
  })

  it('POST /cancel → cancelled', async () => {
    const r0 = await post('/appointments', { professionalId: doctorId, start: wallClockToUtc(day, '16:00').toISOString(), end: wallClockToUtc(day, '16:30').toISOString(), patient: { firstName: 'Cae', lastName: 'Cancel', phone: '+56933334444' } })
    const r = await post(`/appointments/${r0.body.id}/cancel`, {})
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('cancelled')
  })

  it('PUT /patients → upsert por teléfono', async () => {
    const r = await put('/patients', { firstName: 'Ana', lastName: 'Bot', phone })
    expect(r.status).toBe(200)
    expect(r.body.phone).toContain('987654321')
  })

  it('GET /patients/:phone/appointments → citas del paciente', async () => {
    const r = await get(`/patients/${encodeURIComponent(phone)}/appointments`)
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body)).toBe(true)
    expect(r.body.length).toBeGreaterThan(0)
    expect(r.body.every((a: { patient: { phone: string } }) => a.patient.phone.includes('987654321'))).toBe(true)
  })
})
