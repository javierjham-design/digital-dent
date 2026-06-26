import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, PASSWORD, type TenantFixture } from './seed'

// E2E del flujo de dinero punta a punta (stack completo: HTTP → service → tenant DB):
//   medio de pago con % de retención → caja (abrir) → acción evolucionada →
//   cobro ligado a la acción (PAGADO, con comisión) → liquidación del doctor.
// Verifica el cálculo exacto: (montoPagado × %contrato) − comisión proporcional.
let app: Express
let A: TenantFixture
let token = ''
let doctorId = ''

const auth = () => ({ Authorization: `Bearer ${token}` })
const post = (url: string, body: object) => request(app).post(`/api/v1${url}`).set(auth()).send(body)
const get = (url: string) => request(app).get(`/api/v1${url}`).set(auth())

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
  const { createApp } = await import('@/app')
  app = createApp()
  const login = await request(app).post('/api/v1/auth/login').send({ slug: A.slug, username: 'admin', password: PASSWORD })
  token = login.body.token
  const docs = await get('/doctores')
  doctorId = docs.body[0].id
})

describe('flujo de pagos → liquidación (medios de pago, retención, caja, cobro)', () => {
  it('configura todo, evoluciona, cobra con comisión y liquida = (monto×%) − comisión', async () => {
    // 1) Medio de pago con 3% de retención (configurable en Administración)
    const medio = await post('/medios-pago', { nombre: 'Tarjeta crédito', comision: 3 })
    expect(medio.status).toBe(201)
    expect(medio.body.comision).toBe(3)
    const medioPagoId = medio.body.id

    // 2) Prestación $100.000
    const prest = await post('/prestaciones', { nombre: 'Corona', precio: 100000 })
    expect(prest.status).toBe(201)
    const prestacionId = prest.body.id

    // 3) Contrato 50% para el doctor
    const contrato = await post('/contratos', { doctorId, tipo: 'PORCENTAJE', porcentaje: 50 })
    expect(contrato.status).toBe(201)

    // 4) Plan + acción asociada al doctor
    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })
    expect(plan.status).toBe(201)
    const trat = await post('/tratamientos', { pacienteId: A.pacienteId, prestacionId, planId: plan.body.id, precio: 100000 })
    expect(trat.status).toBe(201)
    const tratId = trat.body[0].id

    // 5) Evolucionar (realizada) por el doctor → COMPLETADO + doctorId
    const evo = await post(`/tratamientos/${tratId}/evolucionar`, { texto: 'Realizado', profesionalId: doctorId })
    expect(evo.status).toBe(201)

    // 6) Caja: crear + abrir sesión
    const caja = await post('/cajas', { nombre: 'Caja principal', usuarioIds: [A.adminId] })
    expect(caja.status).toBe(201)
    const cajaId = caja.body.id
    const abrir = await post(`/cajas/${cajaId}/abrir`, { saldoApertura: 0 })
    expect(abrir.status).toBe(201)

    // 7) Cobro $100.000 con la tarjeta (3% de comisión), ligado a la acción
    const cobro = await post('/cobros', {
      pacienteId: A.pacienteId, cajaId, medioPagoId,
      items: [{ tratamientoId: tratId, descripcion: 'Corona', monto: 100000 }],
    })
    expect(cobro.status).toBe(201)
    expect(cobro.body.estado).toBe('PAGADO')
    expect(Math.round(cobro.body.comisionMonto)).toBe(3000) // retención 3% de 100.000

    // 8) Liquidación del doctor: (100.000 × 50%) − 3.000 = 47.000
    const liq = await get(`/liquidaciones-activas/${doctorId}`)
    expect(liq.status).toBe(200)
    const item = liq.body.items.find((i: { tratamientoId: string }) => i.tratamientoId === tratId)
    expect(item).toBeTruthy()
    expect(item.pagada).toBe(true)
    expect(item.montoPagado).toBe(100000)
    expect(item.comision).toBe(3000)
    expect(item.total).toBe(47000)
    expect(liq.body.aPagar).toBe(47000)
  })

  it('una acción evolucionada pero NO pagada queda pendiente (no suma a "A pagar")', async () => {
    const prest = await post('/prestaciones', { nombre: 'Limpieza', precio: 40000 })
    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })
    const trat = await post('/tratamientos', { pacienteId: A.pacienteId, prestacionId: prest.body.id, planId: plan.body.id, precio: 40000 })
    await post(`/tratamientos/${trat.body[0].id}/evolucionar`, { texto: 'Hecho', profesionalId: doctorId })

    const liq = await get(`/liquidaciones-activas/${doctorId}`)
    const item = liq.body.items.find((i: { tratamientoId: string }) => i.tratamientoId === trat.body[0].id)
    expect(item.pagada).toBe(false)
    // "A pagar" sigue siendo solo la acción pagada del test anterior.
    expect(liq.body.aPagar).toBe(47000)
  })

  it('el resumen de liquidaciones activas refleja el contrato y los montos del doctor', async () => {
    const activas = await get('/liquidaciones-activas')
    expect(activas.status).toBe(200)
    const fila = activas.body.find((f: { doctorId: string }) => f.doctorId === doctorId)
    expect(fila).toBeTruthy()
    expect(fila.aPagar).toBe(47000)
    expect(fila.pendientes).toBeGreaterThanOrEqual(1) // la acción impaga
  })
})

describe('configuración del profesional (contratos y horarios)', () => {
  it('crear contrato PORCENTAJE con montoFijo null NO falla (montoFijo no es obligatorio)', async () => {
    const r = await post('/contratos', { doctorId, tipo: 'PORCENTAJE', porcentaje: 40, montoFijo: null, descripcion: null, fechaFin: null })
    expect(r.status).toBe(201)
    expect(r.body.porcentaje).toBe(40)
  })
  it('guardar y leer el horario del profesional (con receso)', async () => {
    const days = [{ diaSemana: 1, horaInicio: '09:00', horaFin: '18:00', activo: true, recesoActivo: true, recesoInicio: '13:00', recesoFin: '14:00' }]
    const r = await post('/horarios', { doctorId, days })
    expect(r.status).toBe(200)
    const list = await get(`/horarios?doctorId=${doctorId}`)
    expect(list.body.some((h: { diaSemana: number; activo: boolean }) => h.diaSemana === 1 && h.activo)).toBe(true)
  })
})
