import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'

// Smoke de arranque SIN base de datos: la app monta, /health responde, las
// rutas protegidas rechazan sin token y las desconocidas dan 404 con el shape
// de error estándar. Las queries a Prisma no se ejecutan (auth corta antes).
let app: Express
beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  process.env.ENCRYPTION_KEY = 'test-encryption-key-1234567890'
  const { createApp } = await import('@/app')
  app = createApp()
})

describe('arranque de la app', () => {
  it('GET /health → 200 ok', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.service).toBe('clariva-backend')
  })

  it('no filtra X-Powered-By', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })

  it('aplica headers de seguridad (helmet)', async () => {
    const res = await request(app).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})

describe('rutas protegidas sin token → 401', () => {
  for (const path of ['/api/v1/pacientes', '/api/v1/citas', '/api/v1/cobros', '/api/v1/clinica', '/api/v1/auth/me']) {
    it(`GET ${path} → 401`, async () => {
      const res = await request(app).get(path)
      expect(res.status).toBe(401)
    })
  }

  it('rutas de super-admin sin token → 401', async () => {
    const res = await request(app).get('/api/v1/admin/stats')
    expect(res.status).toBe(401)
  })

  it('token con firma inválida → 401', async () => {
    const res = await request(app).get('/api/v1/pacientes').set('Authorization', 'Bearer no.es.un.jwt')
    expect(res.status).toBe(401)
  })
})

describe('rutas inexistentes → 404', () => {
  it('GET /api/v1/inexistente → 404', async () => {
    const res = await request(app).get('/api/v1/inexistente')
    expect(res.status).toBe(404)
  })
})
