import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, PASSWORD, type TenantFixture } from './seed'

// Aislamiento FÍSICO (database-per-tenant): cada clínica vive en su propia base
// sqlite (archivo distinto). Una clínica no puede ver datos de otra porque están
// en bases separadas. Stack completo: HTTP → middleware → service → su tenant DB.
let app: Express
let A: TenantFixture, B: TenantFixture
let superAdmin: { email: string }
let tokenA = '', tokenB = '', tokenSuper = ''

async function login(body: object) {
  const res = await request(app).post('/api/v1/auth/login').send(body)
  return { status: res.status, token: res.body?.token as string | undefined, user: res.body?.user }
}

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A; B = seeded.B; superAdmin = seeded.superAdmin
  const { createApp } = await import('@/app')
  app = createApp()
  tokenA = (await login({ slug: A.slug, username: 'admin', password: PASSWORD })).token!
  tokenB = (await login({ slug: B.slug, username: 'admin', password: PASSWORD })).token!
  tokenSuper = (await login({ email: superAdmin.email, password: PASSWORD })).token!
})

describe('login dual (control-plane + tenant)', () => {
  it('clínica: slug+usuario contra su propia base → token con su clinicaId (control)', async () => {
    const r = await login({ slug: A.slug, username: 'admin', password: PASSWORD })
    expect(r.status).toBe(200)
    expect(r.user.clinicaId).toBe(A.clinicaId)
    expect(r.user.isPlatformAdmin).toBe(false)
  })
  it('plataforma: email contra el control-plane → super-admin', async () => {
    const r = await login({ email: superAdmin.email, password: PASSWORD })
    expect(r.status).toBe(200)
    expect(r.user.isPlatformAdmin).toBe(true)
    expect(r.user.clinicaId).toBeNull()
  })
  it('contraseña incorrecta → 401', async () => {
    expect((await login({ slug: A.slug, username: 'admin', password: 'mala' })).status).toBe(401)
  })
})

describe('aislamiento físico de datos', () => {
  it('GET /pacientes solo trae los de la propia base', async () => {
    const ra = await request(app).get('/api/v1/pacientes').set('Authorization', `Bearer ${tokenA}`)
    expect(ra.status).toBe(200)
    const idsA = ra.body.map((p: any) => p.id)
    expect(idsA).toContain(A.pacienteId)
    expect(idsA).not.toContain(B.pacienteId)
    expect(ra.body.length).toBe(1)
  })
  it('un paciente de OTRA clínica no existe en mi base → 404', async () => {
    const r = await request(app).get(`/api/v1/pacientes/${B.pacienteId}`).set('Authorization', `Bearer ${tokenA}`)
    expect(r.status).toBe(404)
  })
  it('crear paciente en A no aparece en B (bases separadas)', async () => {
    const creado = await request(app).post('/api/v1/pacientes').set('Authorization', `Bearer ${tokenA}`).send({ nombre: 'Nuevo', apellido: 'EnA' })
    expect(creado.status).toBe(201)
    const listaB = await request(app).get('/api/v1/pacientes').set('Authorization', `Bearer ${tokenB}`)
    expect(listaB.body.map((p: any) => p.id)).not.toContain(creado.body.id)
  })
  it('no se puede agendar usando un paciente de otra clínica → 404', async () => {
    // doctor de A
    const docs = await request(app).get('/api/v1/doctores').set('Authorization', `Bearer ${tokenA}`)
    const doctorId = docs.body[0].id
    const r = await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`)
      .send({ pacienteId: B.pacienteId, doctorId, fecha: '2026-07-01T10:00:00.000Z', duracion: 30 })
    expect(r.status).toBe(404)
  })
})

describe('gating de roles', () => {
  it('admin de clínica → /admin/* 403', async () => {
    expect((await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${tokenA}`)).status).toBe(403)
  })
  it('super-admin → /admin/stats 200', async () => {
    const r = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${tokenSuper}`)
    expect(r.status).toBe(200)
    expect(typeof r.body.total).toBe('number')
  })
  it('super-admin (sin clinicaId) → rutas de clínica 403', async () => {
    const r = await request(app).get('/api/v1/pacientes').set('Authorization', `Bearer ${tokenSuper}`)
    expect(r.status).toBe(403)
  })
})

describe('catálogo público de planes', () => {
  it('GET /planes sin token → 200', async () => {
    const r = await request(app).get('/api/v1/planes')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.planes)).toBe(true)
    expect(r.body.planes.length).toBeGreaterThan(0)
  })
})
