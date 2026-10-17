import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { crearCaja, abrirSesion, cerrarSesion, detalleSesion } from '@/services/caja.service'
import { actualizarCobro } from '@/services/cobros.service'
import type { JwtPayload } from '@/services/auth.service'

// Dinero#1/#2: una sesión CERRADA sella su cuadre. Editar (o borrar) un cobro
// después del cierre NO debe recalcular el arqueo sellado: saldoEsperado/saldoReal/
// diferencia quedan congelados, aunque el monto del cobro cambie.
let dbName = ''
let adminId = ''
let pacId = ''
beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.A.dbName
  const db = tenantClient(dbName)
  const admin = await db.user.create({ data: { name: 'AdmCaja', role: 'admin', activo: true, email: 'adm-caja@x.cl', password: 'x' } })
  const pac = await db.paciente.create({ data: { nombre: 'Pa', apellido: 'Caja', activo: true } })
  adminId = admin.id; pacId = pac.id
})

const actor = (id: string) => ({ sub: id, role: 'admin' } as unknown as JwtPayload)

describe('cuadre congelado de una sesión cerrada', () => {
  it('editar el monto de un cobro tras cerrar NO cambia el cuadre sellado', async () => {
    const db = tenantClient(dbName)
    const caja = await crearCaja(db, actor(adminId), { saldoInicial: 0 })
    const sesion = await abrirSesion(db, actor(adminId), caja.id, 0)

    // Pago en efectivo de $50.000 recibido en esta sesión.
    const cobro = await db.cobro.create({ data: { pacienteId: pacId, numero: 7001, concepto: 'Abono', monto: 50000, montoNeto: 50000, estado: 'PAGADO' } })
    await db.movimientoCaja.create({ data: { cajaId: caja.id, sesionCajaId: sesion.id, tipo: 'INGRESO', monto: 50000, descripcion: 'Cobro #7001', categoria: 'COBRO', cobroId: cobro.id, userId: adminId } })

    // Cierre: contó $50.000 → cuadrada (diferencia 0).
    await cerrarSesion(db, actor(adminId), caja.id, { saldoReal: 50000 })

    // Corrección posterior: el pago en realidad era $30.000.
    await actualizarCobro(db, actor(adminId), cobro.id, { monto: 30000 })

    const detalle = await detalleSesion(db, actor(adminId), caja.id, sesion.id)
    // El cuadre sellado NO se mueve: esperado 50.000, real 50.000, diferencia 0.
    expect(detalle.sesion.saldoEsperado).toBe(50000)
    expect(detalle.sesion.saldoReal).toBe(50000)
    expect(detalle.sesion.diferencia).toBe(0)
    // El resumen recomputado también respeta el sellado (no baja a 30.000).
    expect(detalle.resumen?.efectivoEsperado).toBe(50000)
  })
})
