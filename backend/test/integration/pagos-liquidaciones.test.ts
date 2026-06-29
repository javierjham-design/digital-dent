import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { seedDosClinicas, PASSWORD, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'

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

describe('reglas de pagos: plan obligatorio, pagos del paciente, derivar abono, gastos en caja', () => {
  let cajaId = ''
  beforeAll(async () => {
    const caja = await post('/cajas', { nombre: 'Caja test pagos', usuarioIds: [A.adminId] })
    cajaId = caja.body.id
    await post(`/cajas/${cajaId}/abrir`, { saldoApertura: 0 })
  })

  it('rechaza un cobro sin asociación a un plan de tratamiento', async () => {
    const r = await post('/cobros', { pacienteId: A.pacienteId, cajaId, items: [{ descripcion: 'Pago suelto', monto: 10000 }] })
    expect(r.status).toBe(400)
  })

  it('acepta un abono libre al plan y lo lista en los pagos del paciente (Historial)', async () => {
    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })
    const planId = plan.body.id
    const cobro = await post('/cobros', { pacienteId: A.pacienteId, cajaId, items: [{ planId, descripcion: 'Abono libre al plan', monto: 25000 }] })
    expect(cobro.status).toBe(201)
    const det = await get(`/planes-tratamiento/${planId}`)
    expect(det.body.abonoLibre).toBe(25000)
    // El listado de planes también expone abonoLibre (lo usa el estado financiero de la tarjeta).
    const lista = await get(`/planes-tratamiento?pacienteId=${A.pacienteId}`)
    expect(lista.body.find((p: { id: string }) => p.id === planId)?.abonoLibre).toBe(25000)
    const pagos = await get(`/cobros?pacienteId=${A.pacienteId}`)
    expect(pagos.body.some((c: { id: string }) => c.id === cobro.body.id)).toBe(true)
  })

  it('deriva el abono libre de un plan a otro plan del mismo paciente', async () => {
    const planA = (await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })).body
    const planB = (await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })).body
    await post('/cobros', { pacienteId: A.pacienteId, cajaId, items: [{ planId: planA.id, descripcion: 'Abono', monto: 30000 }] })

    const der = await post('/cobros/derivar-abono', { fromPlanId: planA.id, toPlanId: planB.id, monto: 20000 })
    expect(der.status).toBe(200)

    const detA = await get(`/planes-tratamiento/${planA.id}`)
    const detB = await get(`/planes-tratamiento/${planB.id}`)
    expect(detA.body.abonoLibre).toBe(10000)
    expect(detB.body.abonoLibre).toBe(20000)
  })

  it('exige el N° de referencia en pagos con tarjeta y guarda referencia + boleta', async () => {
    const medio = await post('/medios-pago', { nombre: 'Tarjeta Redcompra', comision: 2, requiereReferencia: true })
    expect(medio.body.requiereReferencia).toBe(true)
    const medioPagoId = medio.body.id
    const plan = (await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })).body

    // Sin referencia → rechazado
    const sinRef = await post('/cobros', { pacienteId: A.pacienteId, cajaId, medioPagoId, items: [{ planId: plan.id, descripcion: 'Abono', monto: 10000 }] })
    expect(sinRef.status).toBe(400)

    // Con referencia + boleta → OK y persiste
    const conRef = await post('/cobros', { pacienteId: A.pacienteId, cajaId, medioPagoId, numeroReferencia: 'OP-12345', numeroBoleta: 'B-987', items: [{ planId: plan.id, descripcion: 'Abono', monto: 10000 }] })
    expect(conRef.status).toBe(201)
    expect(conRef.body.numeroReferencia).toBe('OP-12345')
    expect(conRef.body.numeroBoleta).toBe('B-987')
  })

  it('registra un gasto (egreso) en la caja abierta y baja el saldo esperado', async () => {
    const before = await get('/cajas/resumen')
    const saldoBefore = before.body.find((c: { id: string }) => c.id === cajaId).sesionAbierta.resumen.saldoEsperado

    const gasto = await post(`/cajas/${cajaId}/movimientos`, { tipo: 'EGRESO', categoria: 'INSUMOS', monto: 5000, descripcion: 'Guantes' })
    expect(gasto.status).toBe(201)

    const after = await get('/cajas/resumen')
    const fila = after.body.find((c: { id: string }) => c.id === cajaId)
    expect(fila.sesionAbierta.resumen.saldoEsperado).toBe(saldoBefore - 5000)
    expect(fila.sesionAbierta.resumen.egresos).toBeGreaterThanOrEqual(5000)
  })
})

describe('prestaciones: sin duplicados (creación idempotente + dedupe automática)', () => {
  it('crear dos veces la misma prestación (mismo nombre+categoría) NO duplica, reutiliza', async () => {
    const a = await post('/prestaciones', { nombre: 'Sellante Único', categoria: 'PREVENCIÓN', precio: 15000 })
    expect(a.status).toBe(201)
    const b = await post('/prestaciones', { nombre: '  sellante   único ', categoria: 'prevención', precio: 16000 })
    expect(b.status).toBe(201)
    expect(b.body.id).toBe(a.body.id) // reutiliza la existente, no crea otra
    const list = await get('/prestaciones')
    const matches = list.body.filter((p: { nombre: string }) => p.nombre.trim().toLowerCase() === 'sellante único')
    expect(matches.length).toBe(1)
  })

  it('dedupe fusiona duplicados heredados y repunta los tratamientos a la conservada', async () => {
    const db = tenantClient(A.dbName)
    // Simula duplicados como los heredados del monolito (3 copias idénticas).
    const p1 = await db.prestacion.create({ data: { nombre: 'Barniz Flúor', categoria: 'GENERAL', precio: 29900, duracion: 30, activo: true } })
    const p2 = await db.prestacion.create({ data: { nombre: 'Barniz Flúor', categoria: 'GENERAL', precio: 29900, duracion: 30, activo: true } })
    await db.prestacion.create({ data: { nombre: 'Barniz Flúor', categoria: 'GENERAL', precio: 29900, duracion: 30, activo: true } })
    expect(p1.id).not.toBe(p2.id)
    // Una acción usa la 2da copia → debe sobrevivir repuntada tras la fusión.
    const trat = await post('/tratamientos', { pacienteId: A.pacienteId, prestacionId: p2.id, precio: 29900 })
    expect(trat.status).toBe(201)
    const tratId = trat.body[0].id

    const r = await post('/prestaciones/dedupe', {})
    expect(r.status).toBe(200)

    const restantes = await db.prestacion.findMany({ where: { nombre: 'Barniz Flúor', categoria: 'GENERAL' } })
    expect(restantes.length).toBe(1) // queda una sola
    const t = await db.tratamiento.findUnique({ where: { id: tratId }, select: { prestacionId: true } })
    expect(t?.prestacionId).toBe(restantes[0].id) // el tratamiento quedó apuntando a la conservada
  })
})

describe('ficha del paciente: datos y registro de accesos', () => {
  it('guarda y devuelve sexo, dirección, observaciones y fecha de nacimiento', async () => {
    const r = await request(app).patch(`/api/v1/pacientes/${A.pacienteId}`).set(auth())
      .send({ sexo: 'Femenino', direccion: 'Av. Siempre Viva 742', observaciones: 'Alergia a la penicilina', fechaNacimiento: '1990-05-15' })
    expect(r.status).toBe(200)
    expect(r.body.sexo).toBe('Femenino')
    expect(r.body.direccion).toBe('Av. Siempre Viva 742')
    expect(r.body.observaciones).toBe('Alergia a la penicilina')
    const g = await get(`/pacientes/${A.pacienteId}`)
    expect(g.body.fechaNacimiento).toContain('1990-05-15')
  })

  it('registra el acceso a la ficha en el Historial (y no lo duplica dentro del minuto)', async () => {
    await get(`/pacientes/${A.pacienteId}`)
    const hist = await get(`/historial?pacienteId=${A.pacienteId}`)
    const accesos1 = hist.body.filter((h: { accion: string }) => h.accion === 'ACCESO').length
    expect(accesos1).toBeGreaterThanOrEqual(1)
    // Segundo acceso inmediato del mismo usuario → throttle: no agrega otro.
    await get(`/pacientes/${A.pacienteId}`)
    const hist2 = await get(`/historial?pacienteId=${A.pacienteId}`)
    const accesos2 = hist2.body.filter((h: { accion: string }) => h.accion === 'ACCESO').length
    expect(accesos2).toBe(accesos1)
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
