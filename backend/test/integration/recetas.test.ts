import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, PASSWORD, type TenantFixture } from './seed'

// Recetas y órdenes de examen: MEDICAMENTOS/EXAMENES se cargan como LISTA (uno por
// línea) y se imprimen como <ul><li> (cada ítem escapado). La plantilla base "Orden
// de exámenes" se auto-siembra por código en clínicas existentes.
let app: Express
let A: TenantFixture
let token = ''
const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (url: string, body: object) => request(app).post(`/api/v1${url}`).set(auth()).send(body)
const get = (url: string) => request(app).get(`/api/v1${url}`).set(auth())

let plantillas: { id: string; codigo: string; categoria: string }[] = []

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
  const { createApp } = await import('@/app')
  app = createApp()
  const login = await request(app).post('/api/v1/auth/login').send({ slug: A.slug, username: 'admin', password: PASSWORD })
  token = login.body.token
  const r = await get('/consentimientos/plantillas?grupo=DOCUMENTO&activas=1')
  plantillas = r.body
})

describe('recetas / órdenes: listas de medicamentos y exámenes', () => {
  it('la plantilla base "Orden de exámenes" (ORD-01) se auto-siembra', () => {
    expect(plantillas.find((p) => p.codigo === 'ORD-01')?.categoria).toBe('ORDEN')
    expect(plantillas.find((p) => p.codigo === 'RX-01')?.categoria).toBe('RECETA')
  })

  it('MEDICAMENTOS se imprime como <ul><li> (uno por línea, escapado)', async () => {
    const receta = plantillas.find((p) => p.codigo === 'RX-01')!
    const r = await post('/consentimientos/previsualizar', {
      pacienteId: A.pacienteId, plantillaId: receta.id,
      extra: { MEDICAMENTOS: 'Amoxicilina 500 mg c/8h\nParacetamol 500 mg <si duele>' },
    })
    expect(r.status).toBe(200)
    const html = r.body.html as string
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>Amoxicilina 500 mg c/8h</li>')
    expect(html).toContain('&lt;si duele&gt;')                       // escapado, no HTML crudo
    expect(html).not.toContain('Amoxicilina 500 mg c/8h\nParacetamol') // el salto se convirtió en <li>
  })

  it('EXAMENES en la orden de exámenes también es lista', async () => {
    const orden = plantillas.find((p) => p.codigo === 'ORD-01')!
    const r = await post('/consentimientos/previsualizar', {
      pacienteId: A.pacienteId, plantillaId: orden.id,
      extra: { EXAMENES: 'Hemograma\nPerfil bioquímico' },
    })
    const html = r.body.html as string
    expect(html).toContain('<li>Hemograma</li>')
    expect(html).toContain('<li>Perfil bioquímico</li>')
  })

  it('lista vacía → no rompe (queda la línea en blanco)', async () => {
    const receta = plantillas.find((p) => p.codigo === 'RX-01')!
    const r = await post('/consentimientos/previsualizar', { pacienteId: A.pacienteId, plantillaId: receta.id, extra: { MEDICAMENTOS: '' } })
    expect(r.status).toBe(200)
    expect(r.body.html).not.toContain('<ul>')
  })
})
