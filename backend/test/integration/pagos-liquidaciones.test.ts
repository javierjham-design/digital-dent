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
    expect(lead?.estado).toBe('CONVERTIDO')
    expect(lead?.pacienteId).toBe(conv.body.pacienteId)
  })

  it('rechaza el intake con token inválido', async () => {
    const r = await request(app).post(`/api/v1/public/crm/${A.slug}/token-malo/lead`).send({ nombre: 'X' })
    expect(r.status).toBe(404)
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
