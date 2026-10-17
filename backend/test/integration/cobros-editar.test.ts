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
})
