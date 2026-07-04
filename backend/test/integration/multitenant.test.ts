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

describe('permiso CRM: habilitar el módulo a otros usuarios', () => {
  let userToken = ''
  let userId = ''
  it('crea un usuario no-admin (sin permiso CRM) y lo loguea', async () => {
    const r = await request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Recepción', username: 'recep-crm', password: 'Password123', role: 'staff' })
    expect(r.status).toBe(201)
    userId = r.body.id
    const l = await login({ slug: A.slug, username: 'recep-crm', password: 'Password123' })
    expect(l.status).toBe(200)
    userToken = l.token!
    expect(l.user.permisos.puedeGestionarCrm).toBe(false)
  })
  it('sin permiso → 403 en /crm/leads', async () => {
    const r = await request(app).get('/api/v1/crm/leads').set('Authorization', `Bearer ${userToken}`)
    expect(r.status).toBe(403)
  })
  it('el admin habilita puedeGestionarCrm → el usuario ahora accede (200)', async () => {
    const g = await request(app).patch(`/api/v1/usuarios/${userId}`).set('Authorization', `Bearer ${tokenA}`).send({ puedeGestionarCrm: true })
    expect(g.status).toBe(200)
    expect(g.body.puedeGestionarCrm).toBe(true)
    const r = await request(app).get('/api/v1/crm/leads').set('Authorization', `Bearer ${userToken}`)
    expect(r.status).toBe(200)
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

describe('multi-país: el super-admin fija el país de la clínica', () => {
  it('cambia el país a Panamá; la sesión lo refleja y el documento se valida flexible', async () => {
    const cls = await request(app).get('/api/v1/admin/clinicas').set('Authorization', `Bearer ${tokenSuper}`)
    const idA = (cls.body as { id: string; slug: string }[]).find((c) => c.slug === A.slug)!.id
    const chg = await request(app).patch(`/api/v1/admin/clinicas/${idA}/pais`).set('Authorization', `Bearer ${tokenSuper}`).send({ pais: 'PA' })
    expect(chg.status).toBe(200)
    // La sesión del admin de la clínica ahora reporta PA (se lee de la Configuracion)
    const l = await login({ slug: A.slug, username: 'admin', password: PASSWORD })
    expect(l.user.pais).toBe('PA')
    // Un documento que NO es RUT chileno válido se acepta (validación flexible de PA)
    const p = await request(app).post('/api/v1/pacientes').set('Authorization', `Bearer ${l.token}`)
      .send({ nombre: 'Juan', apellido: 'Panamá', rut: '8-123-4567' })
    expect(p.status).toBe(201)
    // Volvemos a Chile para no afectar otros tests
    await request(app).patch(`/api/v1/admin/clinicas/${idA}/pais`).set('Authorization', `Bearer ${tokenSuper}`).send({ pais: 'CL' })
  })
})

// Nota: estos tests van al FINAL porque cambian el slug/clave de la clínica A.
describe('super-admin: link definitivo (slug) + clave del admin', () => {
  const sa = () => ({ Authorization: `Bearer ${tokenSuper}` })
  let idA = ''

  it('el super-admin obtiene el id de la clínica A', async () => {
    const r = await request(app).get('/api/v1/admin/clinicas').set(sa())
    expect(r.status).toBe(200)
    const found = (r.body as { id: string; slug: string }[]).find((c) => c.slug === A.slug)
    expect(found).toBeTruthy(); idA = found!.id
  })

  it('asigna una clave ELEGIDA al admin y permite loguear con ella', async () => {
    const r = await request(app).post(`/api/v1/admin/clinicas/${idA}/reset-admin-password`).set(sa())
      .send({ username: 'admin', newPassword: 'ClaveNueva123', forceChange: false })
    expect(r.status).toBe(200)
    expect(r.body.nuevaPassword).toBe('ClaveNueva123')
    expect((await login({ slug: A.slug, username: 'admin', password: 'ClaveNueva123' })).status).toBe(200)
  })

  it('cambia el slug (link definitivo) y permite loguear con el nuevo', async () => {
    const nuevo = 'clinica-a-definitiva'
    const r = await request(app).patch(`/api/v1/admin/clinicas/${idA}/slug`).set(sa()).send({ slug: nuevo })
    expect(r.status).toBe(200)
    expect(r.body.slug).toBe(nuevo)
    expect((await login({ slug: nuevo, username: 'admin', password: 'ClaveNueva123' })).status).toBe(200)
  })

  it('rechaza un slug reservado', async () => {
    const r = await request(app).patch(`/api/v1/admin/clinicas/${idA}/slug`).set(sa()).send({ slug: 'api' })
    expect(r.status).toBe(400)
  })
})
