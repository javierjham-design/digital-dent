import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { createHmac } from 'node:crypto'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { control } from './control-test'
import { encryptNullable } from '@/lib/crypto'

// Circuito completo del webhook entrante de TuBot: routing por connectionId, firma
// HMAC-SHA256 sobre el body crudo, idempotencia por providerMsgId, transiciones de
// estado y evento status. El acuse por texto pega contra TuBot (no corre en test) →
// es best-effort y no afecta las aserciones. Ver docs/TUBOT_WHATSAPP.md.
let app: Express
let A: TenantFixture
const CONN = 'conn_test'
const SECRET = 'sekret-webhook'

const firmar = (raw: string) => 'sha256=' + createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex')
const post = (connectionId: string, payload: object, firma?: string) => {
  const raw = JSON.stringify(payload)
  return request(app).post(`/api/v1/whatsapp/webhook/${connectionId}`)
    .set('X-Tubot-Signature', firma ?? firmar(raw))
    .set('Content-Type', 'application/json')
    .send(raw)
}

async function crearCita(waMessageSid: string, estado = 'PENDIENTE') {
  const db = tenantClient(A.dbName)
  await db.paciente.update({ where: { id: A.pacienteId }, data: { telefono: '+56911112222' } })
  const cita = await db.cita.create({
    data: { pacienteId: A.pacienteId, doctorId: A.adminId, fecha: new Date(Date.now() + 3600_000), duracion: 30, estado, waMessageSid },
    select: { id: true },
  })
  return cita.id
}

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
  const { createApp } = await import('@/app')
  app = createApp()
  // Habilita WhatsApp/TuBot en la clínica A (control + tenant).
  await control.clinica.update({ where: { id: A.clinicaId }, data: { waEnabled: true, waConnectionId: CONN } })
  await tenantClient(A.dbName).configuracion.update({
    where: { id: 'singleton' },
    data: {
      waEnabled: true, waConnectionId: CONN, waTemplateName: 'recordatorio_cita', waTemplateLang: 'es',
      waApiKey: encryptNullable('cnvk_test'), waWebhookSecret: encryptNullable(SECRET),
    },
  })
})

describe('webhook TuBot: seguridad (firma + routing)', () => {
  it('firma inválida → 401', async () => {
    const r = await post(CONN, { event: 'button', from: '+56911112222', providerMsgId: 'x1', replyTo: 'nope', button: { payload: 'CONFIRMAR' } }, 'sha256=deadbeef')
    expect(r.status).toBe(401)
  })
  it('connectionId inexistente → 401 uniforme', async () => {
    const r = await post('conn_inexistente', { event: 'button', from: '+56911112222', providerMsgId: 'x2', button: { payload: 'CONFIRMAR' } })
    expect(r.status).toBe(401)
  })
})

describe('webhook TuBot: respuestas de botón', () => {
  it('CONFIRMAR → cita CONFIRMADO (idempotente)', async () => {
    const citaId = await crearCita('out_confirm')
    const db = tenantClient(A.dbName)
    const r = await post(CONN, { event: 'button', from: '+56911112222', providerMsgId: 'in_confirm', replyTo: 'out_confirm', button: { payload: 'CONFIRMAR', text: 'Confirmar' } })
    expect(r.status).toBe(200)
    let cita = await db.cita.findUnique({ where: { id: citaId }, select: { estado: true, confirmadoWA: true } })
    expect(cita?.estado).toBe('CONFIRMADO')
    expect(cita?.confirmadoWA).toBe(true)
    // Reprocesar el MISMO providerMsgId no produce otra transición ni otro evento.
    await post(CONN, { event: 'button', from: '+56911112222', providerMsgId: 'in_confirm', replyTo: 'out_confirm', button: { payload: 'CANCELAR' } })
    cita = await db.cita.findUnique({ where: { id: citaId }, select: { estado: true, confirmadoWA: true } })
    expect(cita?.estado).toBe('CONFIRMADO') // NO cambió a CANCELADA
    expect(await db.waEventoEntrante.count({ where: { providerMsgId: 'in_confirm' } })).toBe(1)
  })

  it('CANCELAR → cita CANCELADA', async () => {
    const citaId = await crearCita('out_cancel')
    await post(CONN, { event: 'button', from: '+56911112222', providerMsgId: 'in_cancel', replyTo: 'out_cancel', button: { payload: 'CANCELAR' } })
    const cita = await tenantClient(A.dbName).cita.findUnique({ where: { id: citaId }, select: { estado: true } })
    expect(cita?.estado).toBe('CANCELADA')
  })

  it('REAGENDAR → se marca/deriva (log) sin cambiar el estado', async () => {
    const citaId = await crearCita('out_reag', 'CONFIRMADA')
    await post(CONN, { event: 'button', from: '+56911112222', providerMsgId: 'in_reag', replyTo: 'out_reag', button: { payload: 'REAGENDAR' } })
    const db = tenantClient(A.dbName)
    const cita = await db.cita.findUnique({ where: { id: citaId }, select: { estado: true } })
    expect(cita?.estado).toBe('CONFIRMADA') // no se reagenda automático
    const logs = await db.citaLog.count({ where: { citaId, tipo: 'WA_REAGENDAR' } })
    expect(logs).toBe(1)
  })
})

describe('webhook TuBot: estado de entrega', () => {
  it('status failed → queda visible en la cita (idempotente)', async () => {
    const citaId = await crearCita('out_status')
    const db = tenantClient(A.dbName)
    const r = await post(CONN, { event: 'status', providerMsgId: 'out_status', status: 'failed', reason: 'invalid_number' })
    expect(r.status).toBe(200)
    let cita = await db.cita.findUnique({ where: { id: citaId }, select: { waDeliveryStatus: true, waDeliveryReason: true } })
    expect(cita?.waDeliveryStatus).toBe('failed')
    expect(cita?.waDeliveryReason).toBe('invalid_number')
    // Mismo status de nuevo → no-op.
    await post(CONN, { event: 'status', providerMsgId: 'out_status', status: 'failed', reason: 'invalid_number' })
    expect(await db.waEventoEntrante.count({ where: { providerMsgId: 'out_status' } })).toBe(1)
    cita = await db.cita.findUnique({ where: { id: citaId }, select: { waDeliveryStatus: true } })
    expect(cita?.waDeliveryStatus).toBe('failed')
  })
})
