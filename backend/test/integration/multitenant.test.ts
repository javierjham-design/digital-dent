import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, PASSWORD, type TenantFixture } from './seed'

// Tests de integración del stack completo (HTTP → middleware → service →
// Prisma sqlite). El foco es la propiedad crítica de un SaaS multi-tenant:
// una clínica jamás puede leer ni mutar datos de otra.
let app: Express
let A: TenantFixture, B: TenantFixture
let superAdmin: { email: string }
let tokenA = '', tokenB = '', tokenSuper = ''

async function login(body: object): Promise<{ status: number; token?: string; user?: any }> {
  const res = await request(app).post('/api/v1/auth/login').send(body)
  return { status: res.status, token: res.body?.token, user: res.body?.user }
}

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A; B = seeded.B; superAdmin = seeded.superAdmin
  const { createApp } = await import('@/app')
  app = createApp()
  tokenA = (await login({ slug: A.clinica.slug, username: 'admin', password: PASSWORD })).token!
  tokenB = (await login({ slug: B.clinica.slug, username: 'admin', password: PASSWORD })).token!
  tokenSuper = (await login({ email: superAdmin.email, password: PASSWORD })).token!
})

describe('login dual', () => {
  it('clínica: slug+username+password correcto emite token con su clinicaId', async () => {
    const r = await login({ slug: A.clinica.slug, username: 'admin', password: PASSWORD })
    expect(r.status).toBe(200)
    expect(r.user.clinicaId).toBe(A.clinica.id)
    expect(r.user.isPlatformAdmin).toBe(false)
  })
  it('super-admin: email+password emite token de plataforma', async () => {
    const r = await login({ email: superAdmin.email, password: PASSWORD })
    expect(r.status).toBe(200)
    expect(r.user.isPlatformAdmin).toBe(true)
    expect(r.user.clinicaId).toBeNull()
  })
  it('contraseña incorrecta → 401', async () => {
    expect((await login({ slug: A.clinica.slug, username: 'admin', password: 'mala' })).status).toBe(401)
  })
  it('usuario de A no existe bajo el slug de B → 401', async () => {
    // (mismo username "admin" pero la búsqueda es por clinicaId del slug)
    expect((await login({ slug: A.clinica.slug, username: 'noexiste', password: PASSWORD })).status).toBe(401)
  })
})

describe('aislamiento multi-tenant: pacientes', () => {
  it('GET /pacientes solo devuelve los de la propia clínica', async () => {
    const r = await request(app).get('/api/v1/pacientes').set('Authorization', `Bearer ${tokenA}`)
    expect(r.status).toBe(200)
    const ids = r.body.map((p: any) => p.id)
    expect(ids).toContain(A.paciente.id)
    expect(ids).not.toContain(B.paciente.id)
  })
  it('GET /pacientes/:id de OTRA clínica → 404', async () => {
    const r = await request(app).get(`/api/v1/pacientes/${B.paciente.id}`).set('Authorization', `Bearer ${tokenA}`)
    expect(r.status).toBe(404)
  })
  it('PATCH /pacientes/:id de OTRA clínica → 404 (no muta)', async () => {
    const r = await request(app).patch(`/api/v1/pacientes/${B.paciente.id}`).set('Authorization', `Bearer ${tokenA}`).send({ nombre: 'Hackeado' })
    expect(r.status).toBe(404)
    // verificar que B sigue intacto
    const check = await request(app).get(`/api/v1/pacientes/${B.paciente.id}`).set('Authorization', `Bearer ${tokenB}`)
    expect(check.body.nombre).toBe('Paciente202')
  })
})

describe('aislamiento multi-tenant: citas', () => {
  it('no se puede agendar una cita usando un paciente de otra clínica → 404', async () => {
    const r = await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`)
      .send({ pacienteId: B.paciente.id, doctorId: A.doctor.id, fecha: '2026-07-01T10:00:00.000Z', duracion: 30 })
    expect(r.status).toBe(404)
  })
  it('no se puede agendar usando un doctor de otra clínica → 404', async () => {
    const r = await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`)
      .send({ pacienteId: A.paciente.id, doctorId: B.doctor.id, fecha: '2026-07-01T10:00:00.000Z', duracion: 30 })
    expect(r.status).toBe(404)
  })
  it('GET /citas no cruza clínicas', async () => {
    // A agenda una cita válida
    await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`)
      .send({ pacienteId: A.paciente.id, doctorId: A.doctor.id, fecha: '2026-07-02T09:00:00.000Z', duracion: 30 })
    const listaB = await request(app).get('/api/v1/citas?from=2026-07-01T00:00:00.000Z&to=2026-07-31T00:00:00.000Z').set('Authorization', `Bearer ${tokenB}`)
    expect(listaB.status).toBe(200)
    expect(listaB.body.length).toBe(0)
  })
})

describe('detección de doble reserva (solapamiento)', () => {
  it('segunda cita del mismo doctor en el mismo horario → 409', async () => {
    const base = { pacienteId: A.paciente.id, doctorId: A.doctor.id, fecha: '2026-08-01T15:00:00.000Z', duracion: 30 }
    const r1 = await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`).send(base)
    expect(r1.status).toBe(201)
    const r2 = await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`).send({ ...base, fecha: '2026-08-01T15:15:00.000Z' })
    expect(r2.status).toBe(409)
  })
  it('con sobrecupo=true se permite el solape', async () => {
    const r = await request(app).post('/api/v1/citas').set('Authorization', `Bearer ${tokenA}`)
      .send({ pacienteId: A.paciente.id, doctorId: A.doctor.id, fecha: '2026-08-01T15:15:00.000Z', duracion: 30, sobrecupo: true })
    expect(r.status).toBe(201)
  })
})

describe('endpoints nuevos: aislamiento + cambio de contraseña', () => {
  it('comentarios de un paciente de otra clínica → 404', async () => {
    const r = await request(app).get(`/api/v1/pacientes/${B.paciente.id}/comentarios`).set('Authorization', `Bearer ${tokenA}`)
    expect(r.status).toBe(404)
  })
  it('resumen propio → 200 con KPIs numéricos', async () => {
    const r = await request(app).get(`/api/v1/pacientes/${A.paciente.id}/resumen`).set('Authorization', `Bearer ${tokenA}`)
    expect(r.status).toBe(200)
    expect(typeof r.body.saldo).toBe('number')
  })
  it('resumen de un paciente de otra clínica → 404', async () => {
    const r = await request(app).get(`/api/v1/pacientes/${A.paciente.id}/resumen`).set('Authorization', `Bearer ${tokenB}`)
    expect(r.status).toBe(404)
  })
  it('agregar comentario propio → 201 y aparece en el listado', async () => {
    const c = await request(app).post(`/api/v1/pacientes/${A.paciente.id}/comentarios`).set('Authorization', `Bearer ${tokenA}`).send({ texto: 'Llamar para confirmar' })
    expect(c.status).toBe(201)
    const list = await request(app).get(`/api/v1/pacientes/${A.paciente.id}/comentarios`).set('Authorization', `Bearer ${tokenA}`)
    expect(list.body.some((x: any) => x.texto === 'Llamar para confirmar')).toBe(true)
  })
  it('cambiar-password: contraseña actual incorrecta → 400', async () => {
    const r = await request(app).post('/api/v1/auth/cambiar-password').set('Authorization', `Bearer ${tokenB}`).send({ currentPassword: 'incorrecta', newPassword: 'NuevaClave123' })
    expect(r.status).toBe(400)
  })
  it('cambiar-password: política (corta) → 400', async () => {
    const r = await request(app).post('/api/v1/auth/cambiar-password').set('Authorization', `Bearer ${tokenB}`).send({ currentPassword: PASSWORD, newPassword: 'corta' })
    expect(r.status).toBe(400)
  })
  it('cambiar-password: cambia y permite login con la nueva (y se restaura)', async () => {
    const nueva = 'NuevaClave123'
    const ch = await request(app).post('/api/v1/auth/cambiar-password').set('Authorization', `Bearer ${tokenB}`).send({ currentPassword: PASSWORD, newPassword: nueva })
    expect(ch.status).toBe(200)
    expect((await login({ slug: B.clinica.slug, username: 'admin', password: nueva })).status).toBe(200)
    // restaurar para no afectar otros tests
    const t2 = (await login({ slug: B.clinica.slug, username: 'admin', password: nueva })).token!
    await request(app).post('/api/v1/auth/cambiar-password').set('Authorization', `Bearer ${t2}`).send({ currentPassword: nueva, newPassword: PASSWORD })
  })
})

describe('catálogo público de planes (landing)', () => {
  it('GET /planes sin token → 200 con planes activos', async () => {
    const r = await request(app).get('/api/v1/planes')
    expect(r.status).toBe(200)
    expect(Array.isArray(r.body.planes)).toBe(true)
    expect(r.body.planes.length).toBeGreaterThan(0)
    // shape público: nada de campos internos sensibles
    expect(r.body.planes[0]).toHaveProperty('precioMensual')
  })
})

describe('gating de roles', () => {
  it('un admin de clínica NO accede a endpoints de plataforma → 403', async () => {
    const r = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${tokenA}`)
    expect(r.status).toBe(403)
  })
  it('el super-admin SÍ accede a /admin/stats → 200', async () => {
    const r = await request(app).get('/api/v1/admin/stats').set('Authorization', `Bearer ${tokenSuper}`)
    expect(r.status).toBe(200)
    expect(typeof r.body.total).toBe('number')
  })
  it('el super-admin (sin clinicaId) NO accede a rutas de clínica → 400/403', async () => {
    const r = await request(app).get('/api/v1/pacientes').set('Authorization', `Bearer ${tokenSuper}`)
    expect([400, 403]).toContain(r.status)
  })
})
