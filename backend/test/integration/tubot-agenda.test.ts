import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { hashApiKey } from '@/services/ext.service'

// API de agenda que consume TuBot (Fase 1: catálogo). Auth por token dedicado
// (Clinica.tubotApiKeyHash). Paths exactos del contrato bajo /api/v1.
let app: Express
let A: TenantFixture
let doctorId = ''
const TOKEN = 'tbk_test_agenda'
const get = (url: string, token = TOKEN) => request(app).get(`/api/v1${url}`).set('Authorization', `Bearer ${token}`)

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
  await db.prestacion.create({ data: { nombre: 'Limpieza dental', precio: 15000, duracion: 30, activo: true, categoriaId: cat.id } })
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
