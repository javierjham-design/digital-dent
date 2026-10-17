import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { actualizarCobro } from '@/services/cobros.service'
import type { JwtPayload } from '@/services/auth.service'

// Editar un pago desde la ficha (Recaudación): incluye los campos nuevos (referencia/boleta),
// exige permiso para los campos privilegiados y deja registro de auditoría (EDITAR).
let dbName = ''
let adminId = ''
let recepId = ''
let pacId = ''
beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.A.dbName
  const db = tenantClient(dbName)
  const admin = await db.user.create({ data: { name: 'Adm', role: 'admin', activo: true, email: 'adm-cob@x.cl', password: 'x' } })
  const recep = await db.user.create({ data: { name: 'Rec', role: 'recepcion', activo: true, email: 'rec-cob@x.cl', password: 'x', puedeEditarPagos: false } })
  const pac = await db.paciente.create({ data: { nombre: 'Pa', apellido: 'Go', activo: true } })
  adminId = admin.id; recepId = recep.id; pacId = pac.id
})

const actor = (id: string, role = 'admin') => ({ sub: id, role } as unknown as JwtPayload)

describe('actualizarCobro (editar pago desde la ficha)', () => {
  it('edita monto/referencia/boleta y deja auditoría EDITAR', async () => {
    const db = tenantClient(dbName)
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9001, concepto: 'Abono', monto: 10000, estado: 'PAGADO' } })
    const upd = await actualizarCobro(db, actor(adminId), cobro.id, { monto: 12000, numeroReferencia: 'REF-123', numeroBoleta: 'B-9' })
    expect(upd?.monto).toBe(12000)
    expect(upd?.numeroReferencia).toBe('REF-123')
    expect(upd?.numeroBoleta).toBe('B-9')
    expect(await db.auditLog.count({ where: { entidad: 'Cobro', entidadId: cobro.id, accion: 'EDITAR' } })).toBe(1)
  })

  it('rechaza editar campos privilegiados sin permiso', async () => {
    const db = tenantClient(dbName)
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9002, concepto: 'Abono', monto: 5000, estado: 'PAGADO' } })
    await expect(actualizarCobro(db, actor(recepId, 'recepcion'), cobro.id, { monto: 1 })).rejects.toThrow(/permiso/i)
  })

  it('H6: cambiar estado/medioPagoId ahora exige permiso de pagos', async () => {
    const db = tenantClient(dbName)
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9003, concepto: 'x', monto: 5000, estado: 'PAGADO' } })
    await expect(actualizarCobro(db, actor(recepId, 'recepcion'), cobro.id, { estado: 'PENDIENTE' })).rejects.toThrow(/permiso/i)
  })

  it('H7: no se puede ANULAR por PATCH (debe usar la acción Anular)', async () => {
    const db = tenantClient(dbName)
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9004, concepto: 'x', monto: 5000, estado: 'PAGADO' } })
    await expect(actualizarCobro(db, actor(adminId), cobro.id, { estado: 'ANULADO' })).rejects.toThrow(/anular/i)
  })

  it('M13: editar el monto reconcilia el ítem único y rechaza cobros multi-ítem', async () => {
    const db = tenantClient(dbName)
    const uno = await db.cobro.create({ data: { pacienteId: pacId, numero: 9005, concepto: 'x', monto: 10000, estado: 'PAGADO', items: { create: [{ descripcion: 'abono', monto: 10000 }] } } })
    await actualizarCobro(db, actor(adminId), uno.id, { monto: 12000 })
    const item = await db.cobroItem.findFirst({ where: { cobroId: uno.id } })
    expect(item?.monto).toBe(12000)
    const dos = await db.cobro.create({ data: { pacienteId: pacId, numero: 9006, concepto: 'x', monto: 10000, estado: 'PAGADO', items: { create: [{ descripcion: 'a', monto: 6000 }, { descripcion: 'b', monto: 4000 }] } } })
    await expect(actualizarCobro(db, actor(adminId), dos.id, { monto: 15000 })).rejects.toThrow(/varios/i)
  })

  it('M13: montoNeto/comisionMonto no pueden quedar negativos', async () => {
    const db = tenantClient(dbName)
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9007, concepto: 'x', monto: 5000, estado: 'PAGADO' } })
    await expect(actualizarCobro(db, actor(adminId), cobro.id, { comisionMonto: -100 })).rejects.toThrow(/negativo/i)
  })

  it('Dinero#3: al cambiar el monto recalcula comisión y neto según el medio', async () => {
    const db = tenantClient(dbName)
    const medio = await db.medioPago.create({ data: { nombre: 'Tarjeta 10%', comision: 10 } })
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9008, concepto: 'x', monto: 10000, montoNeto: 9000, comisionMonto: 1000, medioPagoId: medio.id, estado: 'PAGADO' } })
    const upd = await actualizarCobro(db, actor(adminId), cobro.id, { monto: 20000 })
    expect(upd?.comisionMonto).toBe(2000) // 10% de 20000
    expect(upd?.montoNeto).toBe(18000)
  })

  it('Dinero#3: cambiar el medio a Efectivo deja comisión 0 y neto = monto', async () => {
    const db = tenantClient(dbName)
    const medio = await db.medioPago.create({ data: { nombre: 'Tarjeta 5%', comision: 5 } })
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9009, concepto: 'x', monto: 10000, montoNeto: 9500, comisionMonto: 500, medioPagoId: medio.id, estado: 'PAGADO' } })
    const upd = await actualizarCobro(db, actor(adminId), cobro.id, { medioPagoId: null })
    expect(upd?.comisionMonto).toBe(0)
    expect(upd?.montoNeto).toBe(10000)
  })

  it('Dinero#4: rechaza editar el monto de un pago dividido en dos medios', async () => {
    const db = tenantClient(dbName)
    const m1 = await db.medioPago.create({ data: { nombre: 'Débito', comision: 0 } })
    const m2 = await db.medioPago.create({ data: { nombre: 'Crédito', comision: 3 } })
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 9010, concepto: 'x', monto: 10000, monto2: 4000, medioPagoId: m1.id, medioPago2Id: m2.id, estado: 'PAGADO' } })
    await expect(actualizarCobro(db, actor(adminId), cobro.id, { monto: 15000 })).rejects.toThrow(/dividido/i)
  })
})
