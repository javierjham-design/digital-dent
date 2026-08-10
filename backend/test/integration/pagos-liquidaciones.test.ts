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

describe('montos fijos por prestación (override del contrato base)', () => {
  let medioPagoId = ''
  let cajaId = ''
  beforeAll(async () => {
    const medio = await post('/medios-pago', { nombre: 'Débito MF', comision: 3 }) // 3% de retención
    medioPagoId = medio.body.id
    // El override requiere un contrato base activo para que el doctor se procese.
    await post('/contratos', { doctorId, tipo: 'PORCENTAJE', porcentaje: 50 })
    const caja = await post('/cajas', { nombre: 'Caja MF', usuarioIds: [A.adminId] })
    cajaId = caja.body.id
    await post(`/cajas/${cajaId}/abrir`, { saldoApertura: 0 })
  })

  // Crea una prestación, la evoluciona el doctor y la cobra completa; devuelve ids.
  async function accionPagada(precio: number, montoCobro: number) {
    const suf = Math.random().toString(36).slice(2, 7)
    const prest = await post('/prestaciones', { nombre: `MF ${precio} ${suf}`, precio })
    const prestacionId = prest.body.id
    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })
    const trat = await post('/tratamientos', { pacienteId: A.pacienteId, prestacionId, planId: plan.body.id, precio })
    const tratId = trat.body[0].id
    await post(`/tratamientos/${tratId}/evolucionar`, { texto: 'Hecho', profesionalId: doctorId })
    const cobro = await post('/cobros', { pacienteId: A.pacienteId, cajaId, medioPagoId, items: [{ tratamientoId: tratId, descripcion: 'MF', monto: montoCobro }] })
    expect(cobro.status).toBe(201)
    return { prestacionId, tratId }
  }
  const itemDe = async (tratId: string) => {
    const liq = await get(`/liquidaciones-activas/${doctorId}`)
    return liq.body.items.find((i: { tratamientoId: string }) => i.tratamientoId === tratId)
  }

  it('fijo ≤ lo cobrado → paga (fijo − retención), NO el % del contrato base', async () => {
    const { prestacionId, tratId } = await accionPagada(100000, 100000)
    const mf = await post('/montos-fijos', { doctorId, prestacionId, montoFijo: 40000 })
    expect(mf.status).toBe(201)
    const item = await itemDe(tratId)
    expect(item.origenCalculo).toBe('MONTO_FIJO_PRESTACION')
    expect(item.montoFijoPrestacion).toBe(40000)
    expect(item.comision).toBe(3000)   // 3% de 100.000
    expect(item.total).toBe(37000)     // 40.000 − 3.000 (no 50%)
  })

  it('fijo > lo cobrado → paga el máximo disponible (lo cobrado − retención)', async () => {
    const { prestacionId, tratId } = await accionPagada(30000, 30000)
    await post('/montos-fijos', { doctorId, prestacionId, montoFijo: 50000 })
    const item = await itemDe(tratId)
    expect(item.origenCalculo).toBe('MONTO_FIJO_PRESTACION')
    expect(item.comision).toBe(900)    // 3% de 30.000
    expect(item.total).toBe(29100)     // 30.000 − 900 (el fijo 50.000 no alcanza)
  })

  it('reconfigurar el fijo (upsert) actualiza el monto sin duplicar', async () => {
    const { prestacionId, tratId } = await accionPagada(80000, 80000)
    await post('/montos-fijos', { doctorId, prestacionId, montoFijo: 20000 })
    await post('/montos-fijos', { doctorId, prestacionId, montoFijo: 50000 }) // upsert
    const lista = await get(`/montos-fijos/${doctorId}`)
    expect(lista.body.filter((m: { prestacionId: string }) => m.prestacionId === prestacionId).length).toBe(1)
    const item = await itemDe(tratId)
    expect(item.total).toBe(50000 - 2400) // 50.000 − 3% de 80.000
  })

  it('lista y elimina el monto fijo; al eliminarlo, la acción vuelve al contrato base (%)', async () => {
    const { prestacionId, tratId } = await accionPagada(60000, 60000)
    const mf = await post('/montos-fijos', { doctorId, prestacionId, montoFijo: 45000 })
    expect((await itemDe(tratId)).origenCalculo).toBe('MONTO_FIJO_PRESTACION')

    const del = await request(app).delete(`/api/v1/montos-fijos/${mf.body.id}`).set(auth())
    expect(del.status).toBe(200)
    const item = await itemDe(tratId)
    expect(item.origenCalculo).toBe('PORCENTAJE')     // vuelve al 50% base
    expect(item.total).toBe(60000 * 0.5 - 1800)        // 30.000 − 3% de 60.000
  })
})

describe('CRM: el primer cobro pagado convierte el lead automáticamente', () => {
  let cajaId = ''
  beforeAll(async () => {
    const caja = await post('/cajas', { nombre: 'Caja conversión', usuarioIds: [A.adminId] })
    cajaId = caja.body.id
    await post(`/cajas/${cajaId}/abrir`, { saldoApertura: 0 })
  })
  // Crea un lead y lo vincula a un paciente (sin marcarlo CONVERTIDO, como hace "convertir").
  async function leadConPaciente(nombre: string) {
    const tel = `+56 9 ${Math.floor(1000 + Math.random() * 8999)} ${Math.floor(1000 + Math.random() * 8999)}`
    const lead = await post('/crm/leads', { nombre, telefono: tel })
    const conv = await post(`/crm/leads/${lead.body.id}/convertir`, {})
    return { leadId: lead.body.id as string, pacienteId: conv.body.pacienteId as string }
  }
  const estadoLead = async (leadId: string) => {
    const db = tenantClient(A.dbName)
    return (await db.lead.findUnique({ where: { id: leadId }, select: { estado: true } }))?.estado
  }
  // Cobro pagado mínimo: un abono libre al plan del paciente.
  async function cobrarAbono(pacienteId: string, monto: number) {
    const plan = await post('/planes-tratamiento', { pacienteId, doctorTitularId: doctorId })
    return post('/cobros', { pacienteId, cajaId, items: [{ planId: plan.body.id, descripcion: 'Abono', monto }] })
  }

  it('primer cobro pagado → el lead pasa a CONVERTIDO', async () => {
    const { leadId, pacienteId } = await leadConPaciente('Convierte Uno')
    expect(await estadoLead(leadId)).not.toBe('CONVERTIDO')
    const c = await cobrarAbono(pacienteId, 20000)
    expect(c.status).toBe(201)
    expect(await estadoLead(leadId)).toBe('CONVERTIDO')
  })

  it('segundo cobro del mismo paciente: sigue CONVERTIDO y no falla (no re-emite)', async () => {
    const { leadId, pacienteId } = await leadConPaciente('Convierte Dos')
    await cobrarAbono(pacienteId, 15000)
    expect(await estadoLead(leadId)).toBe('CONVERTIDO')
    const c2 = await cobrarAbono(pacienteId, 5000) // ya no hay lead no-convertido → no-op
    expect(c2.status).toBe(201)
    expect(await estadoLead(leadId)).toBe('CONVERTIDO')
  })

  it('cobro de un paciente SIN lead vinculado no hace nada (no rompe el cobro)', async () => {
    const p = await post('/pacientes', { nombre: 'Sin', apellido: 'Lead' })
    const c = await cobrarAbono(p.body.id, 10000)
    expect(c.status).toBe(201)
  })
})

describe('vínculo automático lead→paciente por identidad (teléfono/RUT)', () => {
  let telN = 20000000
  const tel = () => { telN++; const s = String(telN); return `+56 9 ${s.slice(0, 4)} ${s.slice(4)}` }
  const db = () => tenantClient(A.dbName)
  const leadPac = async (leadId: string) => (await db().lead.findUnique({ where: { id: leadId }, select: { pacienteId: true } }))?.pacienteId ?? null

  it('crear paciente con el teléfono de UN lead sin vincular → se vincula solo', async () => {
    const t = tel()
    const lead = await post('/crm/leads', { nombre: 'Auto Uno', telefono: t })
    const pac = await post('/pacientes', { nombre: 'Auto', apellido: 'Uno', telefono: t })
    expect(pac.status).toBe(201)
    expect(await leadPac(lead.body.id)).toBe(pac.body.id)
  })

  it('teléfono compartido por VARIOS leads (familia) → NO se vincula; la ficha los sugiere', async () => {
    const t = tel()
    const l1 = await post('/crm/leads', { nombre: 'Fam Uno', telefono: t })
    const l2 = await post('/crm/leads', { nombre: 'Fam Dos', telefono: t })
    const pac = await post('/pacientes', { nombre: 'Fam', apellido: 'Madre', telefono: t })
    expect(await leadPac(l1.body.id)).toBeNull()
    expect(await leadPac(l2.body.id)).toBeNull()
    const sug = await get(`/pacientes/${pac.body.id}/leads-sugeridos`)
    expect(sug.body.leads.length).toBe(2)
    const v = await post(`/pacientes/${pac.body.id}/vincular-lead`, { leadId: l1.body.id })
    expect(v.status).toBe(200)
    expect(await leadPac(l1.body.id)).toBe(pac.body.id)
    const sug2 = await get(`/pacientes/${pac.body.id}/leads-sugeridos`)
    expect(sug2.body.leads.length).toBe(1) // queda solo el otro
  })

  it('crear paciente sin lead que coincida → no vincula nada', async () => {
    const pac = await post('/pacientes', { nombre: 'Solo', apellido: 'Ficha', telefono: tel() })
    expect(pac.status).toBe(201)
    const sug = await get(`/pacientes/${pac.body.id}/leads-sugeridos`)
    expect(sug.body.leads.length).toBe(0)
  })

  it('vincular un lead cuyo paciente YA pagó → CONVERTIDO sin emitir a Meta', async () => {
    const t = tel()
    const l1 = await post('/crm/leads', { nombre: 'Pago Uno', telefono: t })
    await post('/crm/leads', { nombre: 'Pago Dos', telefono: t }) // 2do lead → ambiguo, no autolink
    const pac = await post('/pacientes', { nombre: 'Pago', apellido: 'Previo', telefono: t })
    // El paciente paga ANTES de estar vinculado a un lead (no convierte nada aún).
    const caja = await post('/cajas', { nombre: `Caja vinc ${telN}`, usuarioIds: [A.adminId] })
    await post(`/cajas/${caja.body.id}/abrir`, { saldoApertura: 0 })
    const plan = await post('/planes-tratamiento', { pacienteId: pac.body.id, doctorTitularId: doctorId })
    expect((await post('/cobros', { pacienteId: pac.body.id, cajaId: caja.body.id, items: [{ planId: plan.body.id, descripcion: 'Abono', monto: 12000 }] })).status).toBe(201)
    // Se resuelve el vínculo manualmente → como ya pagó, queda CONVERTIDO SIN emitir.
    const v = await post(`/pacientes/${pac.body.id}/vincular-lead`, { leadId: l1.body.id })
    expect(v.status).toBe(200)
    expect(v.body.convertido).toBe(true)
    const l = await db().lead.findUnique({ where: { id: l1.body.id }, select: { estado: true, pacienteId: true, metaCrmEtapas: true } })
    expect(l?.estado).toBe('CONVERTIDO')
    expect(l?.pacienteId).toBe(pac.body.id)
    expect(l?.metaCrmEtapas).toBeNull() // no se emitió "customer" a Meta
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

describe('áreas clínicas: secciones homónimas + categoriaId como fuente única', () => {
  it('secciones "Homónima" en áreas distintas conviven; duplicada en la MISMA área se rechaza', async () => {
    const dental = await post('/categorias-prestacion', { nombre: 'Homónima', area: 'DENTAL' })
    expect(dental.status).toBe(201)
    const estetica = await post('/categorias-prestacion', { nombre: 'Homónima', area: 'ESTETICA' })
    expect(estetica.status).toBe(201)
    expect(estetica.body.area).toBe('ESTETICA')
    const repetida = await post('/categorias-prestacion', { nombre: 'Homónima', area: 'DENTAL' })
    expect(repetida.status).toBe(400) // misma área → duplicada
  })

  it('prestaciones homónimas en secciones homónimas de áreas distintas NO se fusionan (dedupe)', async () => {
    const cats = await get('/categorias-prestacion')
    const catDental = cats.body.find((c: { nombre: string; area: string }) => c.nombre === 'Homónima' && c.area === 'DENTAL')
    const catEstetica = cats.body.find((c: { nombre: string; area: string }) => c.nombre === 'Homónima' && c.area === 'ESTETICA')
    const p1 = await post('/prestaciones', { nombre: 'Consulta Área', categoriaId: catDental.id, precio: 30000 })
    const p2 = await post('/prestaciones', { nombre: 'Consulta Área', categoriaId: catEstetica.id, precio: 80000 })
    expect(p1.status).toBe(201)
    expect(p2.status).toBe(201)
    expect(p2.body.id).not.toBe(p1.body.id) // la idempotencia NO las confunde entre áreas

    await post('/prestaciones/dedupe', {})
    const db = tenantClient(A.dbName)
    const vivas = await db.prestacion.findMany({ where: { nombre: 'Consulta Área' } })
    expect(vivas.length).toBe(2) // el dedupe del arranque jamás fusiona entre áreas
    expect(vivas.map((v) => v.precio).sort((a, b) => a - b)).toEqual([30000, 80000])
  })

  it('divergencia categoria/categoriaId: crear + renombrar sección mantiene el par sincronizado', async () => {
    const cats = await get('/categorias-prestacion')
    const catEstetica = cats.body.find((c: { nombre: string; area: string }) => c.nombre === 'Homónima' && c.area === 'ESTETICA')
    // Renombrar la sección estética NO debe arrastrar las prestaciones dentales homónimas.
    const r = await request(app).patch(`/api/v1/categorias-prestacion/${catEstetica.id}`).set(auth()).send({ nombre: 'Estética Facial Básica' })
    expect(r.status).toBe(200)

    // Aserción de NO divergencia: para TODA prestación con categoriaId, su string
    // `categoria` es exactamente el nombre de esa sección.
    const db = tenantClient(A.dbName)
    const prestaciones = await db.prestacion.findMany({ where: { categoriaId: { not: null } }, select: { id: true, nombre: true, categoria: true, categoriaId: true } })
    const catsAll = await db.categoriaPrestacion.findMany({ select: { id: true, nombre: true } })
    const nombrePorId = new Map(catsAll.map((c) => [c.id, c.nombre]))
    const divergentes = prestaciones.filter((pr) => pr.categoria !== nombrePorId.get(pr.categoriaId!))
    expect(divergentes).toEqual([]) // si esto falla, alguien escribió un campo sin el otro

    // Y la dental homónima sigue llamándose "Homónima" (no la arrastró el rename).
    const dentalViva = prestaciones.find((pr) => pr.nombre === 'Consulta Área' && pr.categoria === 'Homónima')
    expect(dentalViva).toBeTruthy()
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

  it('valida el RUT chileno (rechaza DV incorrecto) y normaliza el formato', async () => {
    const malo = await post('/pacientes', { nombre: 'Test', apellido: 'RutMalo', rut: '12345678-0' })
    expect(malo.status).toBe(400)
    const bueno = await post('/pacientes', { nombre: 'Test', apellido: 'RutBueno', rut: '11111111-1' })
    expect(bueno.status).toBe(201)
    expect(bueno.body.rut).toBe('11.111.111-1')
  })

  it('permite "Otro documento" sin validación de RUT', async () => {
    const r = await post('/pacientes', { nombre: 'Test', apellido: 'OtroDoc', otroDocId: 'PASAPORTE-AB123' })
    expect(r.status).toBe(201)
    expect(r.body.otroDocId).toBe('PASAPORTE-AB123')
    expect(r.body.rut).toBeNull()
  })

  it('numera la ficha clínica desde 1000 y guarda los campos legales', async () => {
    const nuevo = await post('/pacientes', { nombre: 'Legal', apellido: 'Paciente' })
    expect(nuevo.status).toBe(201)
    expect(nuevo.body.numero).toBeGreaterThanOrEqual(1000)

    const upd = await request(app).patch(`/api/v1/pacientes/${nuevo.body.id}`).set(auth()).send({
      nombreSocial: 'Sol', actividad: 'Profesora', apoderado: 'María Pérez', rutApoderado: '9.876.543-3',
      contactoEmergencia: 'Pedro Pérez', telefonoEmergencia: '+56 9 1234 5678',
    })
    expect(upd.status).toBe(200)
    expect(upd.body.nombreSocial).toBe('Sol')
    expect(upd.body.actividad).toBe('Profesora')
    expect(upd.body.apoderado).toBe('María Pérez')
    expect(upd.body.rutApoderado).toBe('9.876.543-3')
    expect(upd.body.contactoEmergencia).toBe('Pedro Pérez')
    expect(upd.body.telefonoEmergencia).toBe('+56 9 1234 5678')
  })

  it('guarda y devuelve los campos clínicos ampliados de la ficha', async () => {
    const r = await request(app).put(`/api/v1/pacientes/${A.pacienteId}/ficha`).set(auth()).send({
      motivoAtencion: 'Dolor molar', enfermedadesNotas: 'Asma', impresionMedica: 'Caries extensa',
      resumenDiagnostico: 'Plan: endodoncia', fumador: true,
    })
    expect(r.status).toBe(200)
    const g = await get(`/pacientes/${A.pacienteId}/ficha`)
    expect(g.body.ficha.motivoAtencion).toBe('Dolor molar')
    expect(g.body.ficha.enfermedadesNotas).toBe('Asma')
    expect(g.body.ficha.impresionMedica).toBe('Caries extensa')
    expect(g.body.ficha.resumenDiagnostico).toBe('Plan: endodoncia')
    expect(g.body.ficha.fumador).toBe(true)
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

describe('seguridad: acciones realizadas (precio/descuento bloqueados, desrealizar)', () => {
  it('una acción realizada bloquea precio y descuento; al desrealizarla se puede editar de nuevo', async () => {
    const prest = await post('/prestaciones', { nombre: 'Sellante seguridad', precio: 20000 })
    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })
    const trat = await post('/tratamientos', { pacienteId: A.pacienteId, prestacionId: prest.body.id, planId: plan.body.id, precio: 20000 })
    const tratId = trat.body[0].id
    await post(`/tratamientos/${tratId}/evolucionar`, { texto: 'Hecho', profesionalId: doctorId })

    // Realizada → precio y descuento bloqueados (aunque el admin tenga el permiso).
    const p1 = await request(app).patch(`/api/v1/tratamientos/${tratId}`).set(auth()).send({ precio: 30000 })
    expect(p1.status).toBe(403)
    const d1 = await request(app).patch(`/api/v1/tratamientos/${tratId}`).set(auth()).send({ descuento: 10 })
    expect(d1.status).toBe(403)

    // Desrealizar (el admin tiene puedeRevertirCompletado) y ahora sí se puede editar.
    const rev = await request(app).patch(`/api/v1/tratamientos/${tratId}`).set(auth()).send({ estado: 'PLANIFICADO', fechaCompletado: null })
    expect(rev.status).toBe(200)
    const p2 = await request(app).patch(`/api/v1/tratamientos/${tratId}`).set(auth()).send({ precio: 30000 })
    expect(p2.status).toBe(200)
    expect(p2.body.precio).toBe(30000)
  })
})

describe('agendamiento online (links públicos + reserva)', () => {
  it('crea un link, expone slots públicos y permite reservar (cita PENDIENTE origen ONLINE)', async () => {
    const ventanas = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, horaInicio: '09:00', horaFin: '18:00' }))
    const link = await post('/agenda-links', { nombre: 'Evaluaciones', doctorId, usaHorarioDoctor: false, duracionMin: 30, anticipacionHoras: 0, diasMaxFuturo: 7, ventanas })
    expect(link.status).toBe(201)
    const token = link.body.token as string

    // GET público (sin auth) resolviendo por slug
    const pub = await request(app).get(`/api/v1/public/agenda/${A.slug}/${token}`)
    expect(pub.status).toBe(200)
    expect(pub.body.dias.length).toBeGreaterThan(0)
    const slot = pub.body.dias[0].slots[0]
    expect(slot?.inicio).toBeTruthy()

    // Reservar (sin auth)
    const reserva = await request(app).post(`/api/v1/public/agenda/${A.slug}/${token}/reservar`)
      .send({ inicio: slot.inicio, nombre: 'Pedro', apellido: 'Online', telefono: '+56 9 8888 7777', motivo: 'Dolor' })
    expect(reserva.status).toBe(201)
    expect(reserva.body.ok).toBe(true)

    // Aparece en reservas-online (admin) y es una cita PENDIENTE / origen ONLINE
    const reservas = await get('/reservas-online')
    expect(reservas.body.some((r: { id: string }) => r.id === reserva.body.citaId)).toBe(true)
    const db = tenantClient(A.dbName)
    const cita = await db.cita.findUnique({ where: { id: reserva.body.citaId }, select: { estado: true, origen: true, linkAgendaId: true } })
    expect(cita?.estado).toBe('PENDIENTE')
    expect(cita?.origen).toBe('ONLINE')
    // La reserva también genera un lead en el CRM (origen agenda online).
    const leadReserva = await db.lead.findFirst({ where: { citaId: reserva.body.citaId }, select: { origen: true, estado: true } })
    expect(leadReserva?.origen).toBe('AGENDA_ONLINE')

    // El mismo cupo ya no se ofrece
    const pub2 = await request(app).get(`/api/v1/public/agenda/${A.slug}/${token}`)
    const sigue = pub2.body.dias.some((d: { slots: { inicio: string }[] }) => d.slots.some((s) => s.inicio === slot.inicio))
    expect(sigue).toBe(false)
  })

  it('soporta varios profesionales: el público elige y reserva con el seleccionado', async () => {
    const doc2 = await post('/usuarios', { name: 'Dra. Dos', username: 'dra-dos', password: 'Password123', role: 'doctor' })
    expect(doc2.status).toBe(201)
    const doc2Id = doc2.body.id
    const ventanas = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, horaInicio: '09:00', horaFin: '18:00' }))
    const link = await post('/agenda-links', { nombre: 'Eval multi', profesionales: [doctorId, doc2Id], usaHorarioDoctor: false, duracionMin: 30, anticipacionHoras: 0, diasMaxFuturo: 7, ventanas })
    expect(link.status).toBe(201)
    expect(link.body.profesionales.length).toBe(2)
    const token = link.body.token as string

    const pub = await request(app).get(`/api/v1/public/agenda/${A.slug}/${token}?doctorId=${doc2Id}`)
    expect(pub.status).toBe(200)
    expect(pub.body.link.profesionales.length).toBe(2)
    expect(pub.body.doctorId).toBe(doc2Id)
    const slot = pub.body.dias[0].slots[0]

    const reserva = await request(app).post(`/api/v1/public/agenda/${A.slug}/${token}/reservar`)
      .send({ inicio: slot.inicio, doctorId: doc2Id, nombre: 'Ana', apellido: 'Multi', telefono: '+56 9 7777 6666' })
    expect(reserva.status).toBe(201)
    const db = tenantClient(A.dbName)
    const cita = await db.cita.findUnique({ where: { id: reserva.body.citaId }, select: { doctorId: true } })
    expect(cita?.doctorId).toBe(doc2Id)
  })

  it('rechaza reservar un horario fuera de la disponibilidad', async () => {
    const link = await post('/agenda-links', { nombre: 'Solo lunes', doctorId, usaHorarioDoctor: false, duracionMin: 30, anticipacionHoras: 0, diasMaxFuturo: 7, ventanas: [{ diaSemana: 1, horaInicio: '09:00', horaFin: '10:00' }] })
    const token = link.body.token as string
    // Un instante arbitrario lejano (no es un slot generado)
    const r = await request(app).post(`/api/v1/public/agenda/${A.slug}/${token}/reservar`)
      .send({ inicio: '2030-01-01T03:00:00.000Z', nombre: 'X', apellido: 'Y', telefono: '+56 9 1234 5678' })
    expect(r.status).toBe(409)
  })
})

describe('CRM: captación de leads + conversión a paciente', () => {
  it('capta un lead por el formulario público y lo convierte a paciente', async () => {
    const cfg = await get('/crm/config')
    expect(cfg.status).toBe(200)
    const token = cfg.body.crmToken as string
    expect(token).toBeTruthy()

    const intake = await request(app).post(`/api/v1/public/crm/${A.slug}/${token}/lead`)
      .send({ nombre: 'Camila', apellido: 'Prospecto', telefono: '+56 9 5555 4444', email: 'camila@test.cl', motivo: 'Ortodoncia', utmCampaign: 'meta-julio' })
    expect(intake.status).toBe(201)
    const leadId = intake.body.leadId as string

    const leads = await get('/crm/leads')
    expect(leads.body.some((l: { id: string }) => l.id === leadId)).toBe(true)

    const conv = await post(`/crm/leads/${leadId}/convertir`, {})
    expect(conv.status).toBe(200)
    expect(conv.body.pacienteId).toBeTruthy()
    const db = tenantClient(A.dbName)
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { estado: true, pacienteId: true } })
    // "Solo crear paciente" (convertir) es administrativo POR DISEÑO (2026-07-27): vincula
    // el paciente al lead pero CONSERVA su estado — NO lo marca CONVERTIDO ni dispara el
    // evento "customer" de Meta (crear la ficha ≠ conversión del embudo). Ver
    // crm.service.convertirEnPaciente. La conversión del embudo es un cambio de estado aparte.
    expect(lead?.estado).toBe('NUEVO')
    expect(lead?.pacienteId).toBe(conv.body.pacienteId)
  })

  it('rechaza el intake con token inválido', async () => {
    const r = await request(app).post(`/api/v1/public/crm/${A.slug}/token-malo/lead`).send({ nombre: 'X' })
    expect(r.status).toBe(404)
  })

  it('marca y cuenta los leads abiertos sin gestión hace más de 4 días', async () => {
    const nuevo = await post('/crm/leads', { nombre: 'Olvidado', telefono: '+56 9 4444 3333' })
    const leadId = nuevo.body.id as string
    const db = tenantClient(A.dbName)
    // Backdatea la última gestión a 6 días atrás (sigue en estado NUEVO)
    await db.lead.update({ where: { id: leadId }, data: { ultimaGestionAt: new Date(Date.now() - 6 * 86400_000), estado: 'NUEVO' } })

    const resumen = await get('/crm/resumen')
    expect(resumen.body.sinGestionar).toBeGreaterThanOrEqual(1)
    expect(resumen.body.diasSinGestion).toBe(4)

    const leads = await get('/crm/leads')
    const found = (leads.body as { id: string; sinGestionar: boolean }[]).find((l) => l.id === leadId)
    expect(found?.sinGestionar).toBe(true)

    // Al agregar una nota (gestión), deja de estar sin gestionar
    await post(`/crm/leads/${leadId}/notas`, { texto: 'Llamada realizada' })
    const leads2 = await get('/crm/leads')
    expect((leads2.body as { id: string; sinGestionar: boolean }[]).find((l) => l.id === leadId)?.sinGestionar).toBe(false)
  })

  it('CORS: el intake público responde el preflight y permite un origin externo', async () => {
    // Preflight OPTIONS desde una landing externa → 204 con headers CORS
    const pre = await request(app).options(`/api/v1/public/crm/${A.slug}/lo-que-sea/lead`)
      .set('Origin', 'https://digital-dent.cl')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type')
    expect(pre.status).toBe(204)
    expect(pre.headers['access-control-allow-origin']).toBe('https://digital-dent.cl')

    // El POST real también incluye el header CORS y crea el lead
    const cfg = await get('/crm/config')
    const token = cfg.body.crmToken as string
    const post = await request(app).post(`/api/v1/public/crm/${A.slug}/${token}/lead`)
      .set('Origin', 'https://digital-dent.cl')
      .send({ nombre: 'CORS', apellido: 'Externo', telefono: '+56 9 1010 2020' })
    expect(post.status).toBe(201)
    expect(post.headers['access-control-allow-origin']).toBe('https://digital-dent.cl')

    // Una ruta AUTENTICADA no debe abrirse a ese origin externo (CORS estricto)
    const priv = await request(app).options('/api/v1/crm/leads')
      .set('Origin', 'https://digital-dent.cl')
      .set('Access-Control-Request-Method', 'GET')
    expect(priv.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('genera una API key (MCP) y permite leer leads/stats por /ext; rechaza key inválida', async () => {
    const rot = await post('/crm/api-key/rotate', {})
    expect(rot.status).toBe(201)
    const apiKey = rot.body.apiKey as string
    expect(apiKey).toMatch(/^clv_/)

    // Lectura read-only sin JWT, sólo con la API key
    const leads = await request(app).get('/api/v1/ext/leads').set('X-API-Key', apiKey)
    expect(leads.status).toBe(200)
    expect(Array.isArray(leads.body)).toBe(true)

    const stats = await request(app).get('/api/v1/ext/stats').set('X-API-Key', apiKey)
    expect(stats.status).toBe(200)
    expect(stats.body.leads).toBeTruthy()
    expect(typeof stats.body.pacientes.total).toBe('number')

    // Key inválida → 401
    const bad = await request(app).get('/api/v1/ext/leads').set('X-API-Key', 'clv_no-existe')
    expect(bad.status).toBe(401)
    // Sin key → 401
    const sin = await request(app).get('/api/v1/ext/leads')
    expect(sin.status).toBe(401)
  })

  it('agenda una hora para el lead: crea paciente + cita y deja el lead AGENDADO', async () => {
    const nuevo = await post('/crm/leads', { nombre: 'Tomás', apellido: 'Agenda', telefono: '+56 9 7777 8888', motivo: 'Implantes' })
    expect(nuevo.status).toBe(201)
    const leadId = nuevo.body.id as string

    const fecha = new Date(Date.now() + 3 * 24 * 3600_000); fecha.setHours(10, 0, 0, 0)
    const ag = await post(`/crm/leads/${leadId}/agendar`, { doctorId, fecha: fecha.toISOString(), duracion: 45 })
    expect(ag.status).toBe(201)
    expect(ag.body.pacienteId).toBeTruthy()
    expect(ag.body.citaId).toBeTruthy()

    const db = tenantClient(A.dbName)
    const lead = await db.lead.findUnique({ where: { id: leadId }, select: { estado: true, pacienteId: true, citaId: true, fechaAgenda: true, agendaFuente: true } })
    expect(lead?.estado).toBe('AGENDADO')
    expect(lead?.pacienteId).toBe(ag.body.pacienteId)
    expect(lead?.citaId).toBe(ag.body.citaId)
    expect(lead?.agendaFuente).toBe('CRM')
    const cita = await db.cita.findUnique({ where: { id: ag.body.citaId }, select: { pacienteId: true, doctorId: true, duracion: true } })
    expect(cita?.pacienteId).toBe(ag.body.pacienteId)
    expect(cita?.duracion).toBe(45)
  })

  it('sincroniza el agendamiento online con un lead existente: no duplica, lo avanza a Agendado', async () => {
    const tel = '+56 9 3333 2211'
    // 1) Lead previo captado por campaña/formulario (origen META)
    const cfg = await get('/crm/config')
    const crmToken = cfg.body.crmToken as string
    const intake = await request(app).post(`/api/v1/public/crm/${A.slug}/${crmToken}/lead`)
      .send({ nombre: 'Lucía', apellido: 'Campaña', telefono: tel, email: 'lucia@test.cl', utmCampaign: 'meta-agosto', origen: 'META' })
    expect(intake.status).toBe(201)
    const leadId = intake.body.leadId as string

    // 2) Link online + primer slot
    const ventanas = [0, 1, 2, 3, 4, 5, 6].map((d) => ({ diaSemana: d, horaInicio: '09:00', horaFin: '18:00' }))
    const link = await post('/agenda-links', { nombre: 'Sync Eval', doctorId, usaHorarioDoctor: false, duracionMin: 30, anticipacionHoras: 0, diasMaxFuturo: 7, ventanas })
    const linkToken = link.body.token as string
    const pub = await request(app).get(`/api/v1/public/agenda/${A.slug}/${linkToken}`)
    const slot = pub.body.dias[0].slots[0]

    // 3) La MISMA persona (mismo teléfono) reserva por el link online
    const reserva = await request(app).post(`/api/v1/public/agenda/${A.slug}/${linkToken}/reservar`)
      .send({ inicio: slot.inicio, nombre: 'Lucía', apellido: 'Campaña', telefono: tel })
    expect(reserva.status).toBe(201)

    // 4) No se duplicó: el lead original se avanzó a Agendado conservando su origen
    const db = tenantClient(A.dbName)
    const mismos = await db.lead.findMany({ where: { telefono: tel } })
    expect(mismos.length).toBe(1)
    expect(mismos[0].id).toBe(leadId)
    expect(mismos[0].estado).toBe('AGENDADO')
    expect(mismos[0].origen).toBe('META')
    expect(mismos[0].agendaFuente).toBe('Sync Eval')
    expect(mismos[0].citaId).toBe(reserva.body.citaId)
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

describe('consentimientos informados', () => {
  it('valida datos faltantes, genera, firma y el admin puede eliminar', async () => {
    const p = await post('/pacientes', { nombre: 'Consent', apellido: 'Test', rut: '12.345.678-5' })
    expect(p.status).toBe(201)
    const pacienteId = p.body.id as string

    const pl = await get('/consentimientos/plantillas?activas=1')
    expect(pl.status).toBe(200)
    expect(pl.body.length).toBeGreaterThan(0)
    const plantillaId = pl.body[0].id as string

    // Generar un consentimiento exige un profesional responsable (con agenda) y, para las
    // plantillas de categoría CONSENTIMIENTO, un plan de tratamiento asociado. Creamos el
    // plan y usamos un doctor como responsable.
    const plan = await post('/planes-tratamiento', { pacienteId, doctorTitularId: doctorId })
    expect(plan.status).toBe(201)
    const planId = plan.body.id as string
    const genBody = { pacienteId, plantillaId, responsableId: doctorId, planId }

    // Falta la fecha de nacimiento → previsualizar lo reporta y generar se bloquea
    const prev = await post('/consentimientos/previsualizar', { pacienteId, plantillaId })
    expect(prev.status).toBe(200)
    expect(prev.body.faltantes.length).toBeGreaterThan(0)
    const g1 = await post('/consentimientos/generar', genBody)
    expect(g1.status).toBe(400) // bloqueado por el dato faltante (fecha de nacimiento)

    // Completar la ficha y generar
    await request(app).patch(`/api/v1/pacientes/${pacienteId}`).set(auth()).send({ fechaNacimiento: '1990-05-10' })
    const g2 = await post('/consentimientos/generar', genBody)
    expect(g2.status).toBe(201)
    expect(g2.body.estado).toBe('BORRADOR')
    const cid = g2.body.id as string
    expect(g2.body.contenidoHtml).toContain('Consent Test') // datos del paciente incrustados

    const lst = await get(`/pacientes/${pacienteId}/consentimientos`)
    expect((lst.body as { id: string }[]).some((c) => c.id === cid)).toBe(true)

    // Firmar (manual) → FIRMADO
    const f = await post(`/consentimientos/${cid}/firmar`, { tipo: 'MANUAL' })
    expect(f.status).toBe(200)
    expect(f.body.estado).toBe('FIRMADO')

    // Eliminar como admin → ok (queda auditado)
    const del = await request(app).delete(`/api/v1/consentimientos/${cid}`).set(auth())
    expect(del.status).toBe(200)
  })
})

describe('radiografías y documentos del paciente', () => {
  it('sube (con tipo/dientes), lista, descarga y elimina un documento', async () => {
    const img = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') // encabezado PNG (contenido de prueba)
    const up = await request(app).post(`/api/v1/pacientes/${A.pacienteId}/documentos`).set(auth())
      .field('tipo', 'PERIAPICAL').field('dientes', '16, 17').attach('file', img, { filename: 'peri.png', contentType: 'image/png' })
    expect(up.status).toBe(201)
    expect(up.body.tipo).toBe('PERIAPICAL')
    expect(up.body.dientes).toBe('16, 17')

    const list = await get(`/pacientes/${A.pacienteId}/documentos`)
    expect((list.body as { id: string }[]).some((d) => d.id === up.body.id)).toBe(true)

    const dl = await request(app).get(`/api/v1/documentos/${up.body.id}`).set(auth())
    expect(dl.status).toBe(200)
    expect(dl.headers['content-type']).toContain('image/png')

    // Rechaza tipos no permitidos (ni imagen ni PDF)
    const bad = await request(app).post(`/api/v1/pacientes/${A.pacienteId}/documentos`).set(auth())
      .field('tipo', 'OTRO').attach('file', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' })
    expect(bad.status).toBe(400)

    const del = await request(app).delete(`/api/v1/documentos/${up.body.id}`).set(auth())
    expect(del.status).toBe(200)
  })
})

describe('áreas clínicas: guard por usuario, multi-zona con UN precio, y capas separadas', () => {
  let catEstetica = { id: '' }
  let botox = { id: '' }
  let docToken = ''
  let docId = ''
  const authDoc = () => ({ Authorization: `Bearer ${docToken}` })

  beforeAll(async () => {
    // Sección + prestación del área ESTETICA (la clínica A contrata dental+estética en el seed).
    catEstetica = (await post('/categorias-prestacion', { nombre: 'Toxina', area: 'ESTETICA' })).body
    botox = (await post('/prestaciones', { nombre: 'Bótox periocular', categoriaId: catEstetica.id, precio: 180000 })).body
    // Usuaria SIN el área estética habilitada (default areaEstetica=false).
    // role staff: no consume el cupo de profesionales con agenda del plan.
    const doc = await post('/usuarios', { name: 'Dra. Área', username: 'dra-area', password: 'Password123', role: 'staff' })
    docId = doc.body.id
    const login = await request(app).post('/api/v1/auth/login').send({ slug: A.slug, username: 'dra-area', password: 'Password123' })
    docToken = login.body.token
  })

  it('la sesión trae las áreas efectivas: admin = las de la clínica; doctor sin flag = solo DENTAL', async () => {
    const meAdmin = await get('/auth/me')
    expect(meAdmin.body.user.areas.sort()).toEqual(['DENTAL', 'ESTETICA'])
    const meDoc = await request(app).get('/api/v1/auth/me').set(authDoc())
    expect(meDoc.body.user.areas).toEqual(['DENTAL'])
  })

  it('guard: el doctor sin areaEstetica NO puede crear un tratamiento estético (403); con el flag sí', async () => {
    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: docId })
    const intento = await request(app).post('/api/v1/tratamientos').set(authDoc())
      .send({ pacienteId: A.pacienteId, prestacionId: botox.id, planId: plan.body.id, precio: 180000 })
    expect(intento.status).toBe(403)

    const habilitar = await request(app).patch(`/api/v1/usuarios/${docId}`).set(auth()).send({ areaEstetica: true })
    expect(habilitar.status).toBe(200)
    const ok = await request(app).post('/api/v1/tratamientos').set(authDoc())
      .send({ pacienteId: A.pacienteId, prestacionId: botox.id, planId: plan.body.id, precio: 180000 })
    expect(ok.status).toBe(201)
  })

  it('multi-zona: UN tratamiento cubre N zonas con UN precio (no duplica en presupuesto/cobro)', async () => {
    const zonas = await get('/zonas-faciales')
    expect(zonas.status).toBe(200)
    expect(zonas.body.length).toBeGreaterThanOrEqual(6) // placeholder sembrado lazy
    const ids = zonas.body.filter((z: { codigo: string }) => z.codigo.startsWith('patas_gallo')).map((z: { id: string }) => z.id)
    expect(ids.length).toBe(2)

    const plan = await post('/planes-tratamiento', { pacienteId: A.pacienteId, doctorTitularId: doctorId })
    const r = await post('/tratamientos', { pacienteId: A.pacienteId, prestacionId: botox.id, planId: plan.body.id, precio: 180000, zonaIds: ids })
    expect(r.status).toBe(201)
    expect(r.body.length).toBe(1) // UN tratamiento (no uno por zona)
    expect(r.body[0].precio).toBe(180000)
    expect(r.body[0].zonas.length).toBe(2)

    const db = tenantClient(A.dbName)
    const uniones = await db.tratamientoZona.count({ where: { tratamientoId: r.body[0].id } })
    expect(uniones).toBe(2)
  })

  it('capas separadas: guardar y borrar trazos del dibujo JAMÁS toca tratamientos ni zonas', async () => {
    const db = tenantClient(A.dbName)
    const antes = await db.tratamiento.count()
    const zonasAntes = await db.tratamientoZona.count()

    const trazos = [{ herramienta: 'lapiz', color: '#1d4ed8', grosor: 2, puntos: [{ x: 0.4, y: 0.3 }, { x: 0.42, y: 0.33 }] }]
    const put1 = await request(app).put(`/api/v1/pacientes/${A.pacienteId}/dibujo-facial`).set(auth()).send({ genero: 'F', trazos })
    expect(put1.status).toBe(200)
    expect(put1.body.trazos.length).toBe(1)

    // "Goma" / reiniciar: borra TODOS los trazos.
    const put2 = await request(app).put(`/api/v1/pacientes/${A.pacienteId}/dibujo-facial`).set(auth()).send({ trazos: [] })
    expect(put2.status).toBe(200)
    expect(put2.body.trazos.length).toBe(0)

    expect(await db.tratamiento.count()).toBe(antes)        // ni un tratamiento tocado
    expect(await db.tratamientoZona.count()).toBe(zonasAntes) // ni una zona de tratamiento tocada
  })

  it('estado por zona (capa 1): se asigna y persiste como el odontograma', async () => {
    const zonas = await get('/zonas-faciales')
    const menton = zonas.body.find((z: { codigo: string }) => z.codigo === 'menton')
    const r = await request(app).put(`/api/v1/pacientes/${A.pacienteId}/zonas-faciales`).set(auth())
      .send({ zonaId: menton.id, estado: 'TRATADO', color: '#7c3aed' })
    expect(r.status).toBe(200)
    const lista = await get(`/pacientes/${A.pacienteId}/zonas-faciales`)
    expect(lista.body.some((z: { zona: { codigo: string }; estado: string }) => z.zona.codigo === 'menton' && z.estado === 'TRATADO')).toBe(true)
  })
})
