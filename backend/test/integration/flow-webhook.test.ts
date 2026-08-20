import { describe, it, expect, beforeAll, vi } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { encryptNullable } from '@/lib/crypto'

// Webhook de Flow: cuando el paciente paga por el link, el cobro debe quedar con el
// MEDIO "Flow" (relación medioPago), no como Efectivo, y con la fecha de confirmación.
let A: TenantFixture
beforeAll(async () => { const s = await seedDosClinicas(); A = s.A })

describe('webhook Flow: marca el cobro pagado con medio Flow (no Efectivo)', () => {
  it('setea medioPagoId al medio "Flow" + fechaPago al confirmarse', async () => {
    const db = tenantClient(A.dbName)
    await db.configuracion.update({ where: { id: 'singleton' }, data: { pagoOnlineEnabled: true, flowApiKey: encryptNullable('k'), flowSecretKey: encryptNullable('s'), flowSandbox: true } })
    const medioFlow = await db.medioPago.create({ data: { nombre: 'Flow', comision: 0 } })
    const cobro = await db.cobro.create({ data: { pacienteId: A.pacienteId, numero: 970001, concepto: 'link', monto: 10000, montoNeto: 10000, estado: 'PENDIENTE' } })
    await db.pagoOnline.create({ data: { cobroId: cobro.id, pacienteId: A.pacienteId, proveedor: 'FLOW', concepto: 'link', monto: 10000, estado: 'PENDIENTE', commerceOrder: `co-${Date.now()}`, flowToken: 'tok-flow-123' } })

    // Flow responde "pagada" (status 2) al consultar el estado por token.
    const fake = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 2, commerceOrder: 'x', amount: 10000 }) })
    vi.stubGlobal('fetch', fake)
    try {
      const { procesarWebhookFlow } = await import('@/services/pagos-online.service')
      await procesarWebhookFlow(db, 'tok-flow-123')
    } finally { vi.unstubAllGlobals() }

    const c = await db.cobro.findUnique({ where: { id: cobro.id }, select: { estado: true, medioPagoId: true, metodoPago: true, fechaPago: true } })
    expect(c?.estado).toBe('PAGADO')
    expect(c?.medioPagoId).toBe(medioFlow.id) // ← Flow, no Efectivo
    expect(c?.metodoPago).toBe('FLOW')
    expect(c?.fechaPago).toBeTruthy()
  })
})
