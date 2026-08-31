import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, PASSWORD, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

// GET /agenda/disponibilidad → slots libres de un profesional (agenda real), para
// elegir la hora al agendar desde el CRM. Auth de tenant (JWT de la clínica).
let app: Express
let A: TenantFixture
let jwt = ''
let doctorId = ''

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
  const { createApp } = await import('@/app')
  app = createApp()
  const login = await request(app).post('/api/v1/auth/login').send({ slug: A.slug, username: 'admin', password: PASSWORD })
  jwt = login.body.token
  const db = tenantClient(A.dbName)
  const doc = await db.user.create({ data: { name: 'Ada Agenda', titulo: 'Dra.', role: 'doctor', activo: true, email: 'ada-agenda@x.cl', password: 'x' } })
  doctorId = doc.id
  await db.horarioDoctor.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({ doctorId, diaSemana, horaInicio: '09:00', horaFin: '13:00', activo: true, recesoActivo: false, sobrecupoActivo: false })) })
})

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${jwt}`)

describe('GET /agenda/disponibilidad', () => {
  it('sin JWT → 401', async () => {
    const r = await request(app).get(`/api/v1/agenda/disponibilidad?doctorId=${doctorId}`)
    expect(r.status).toBe(401)
  })

  it('sin doctorId → 400', async () => {
    const r = await auth(request(app).get('/api/v1/agenda/disponibilidad'))
    expect(r.status).toBe(400)
  })

  it('devuelve slots libres, ordenados y del tamaño de la duración', async () => {
    const r = await auth(request(app).get(`/api/v1/agenda/disponibilidad?doctorId=${doctorId}&durationMin=30&dias=7`))
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.slots)).toBe(true)
    expect(r.body.slots.length).toBeGreaterThan(0)
    const s = r.body.slots[0]
    expect((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000).toBe(30)
    expect(new Date(s.start).getTime()).toBeGreaterThan(Date.now())
    const starts = r.body.slots.map((x: { start: string }) => x.start)
    expect(starts).toEqual([...starts].sort())
  })

  it('respeta la duración pedida (60m)', async () => {
    const r = await auth(request(app).get(`/api/v1/agenda/disponibilidad?doctorId=${doctorId}&durationMin=60&dias=7`))
    expect(r.status).toBe(200)
    expect(r.body.slots.every((x: { start: string; end: string }) => (new Date(x.end).getTime() - new Date(x.start).getTime()) / 60000 === 60)).toBe(true)
  })
})
