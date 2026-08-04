import { describe, it, expect, beforeAll } from 'vitest'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { crearPresupuesto } from '@/services/presupuestos.service'
import { abrirSesion } from '@/lib/caja'

// Regresión del correlativo concurrente: dos creaciones simultáneas en la misma
// clínica NO deben obtener el mismo `numero`. Antes del fix el número se calculaba
// con findFirst(desc)+1 FUERA de la transacción, así que dos operaciones a la vez
// leían el mismo máximo y la segunda chocaba con el @unique ("se cayó el sistema
// al cobrar"). Ahora el número se genera dentro de la transacción vía
// `siguienteNumero` (advisory lock en Postgres; en estos tests SQLite serializa).
//
// Se prueba con Presupuesto y SesionCaja porque son los servicios más baratos de
// montar; los 4 sitios de cobro usan EXACTAMENTE el mismo helper `siguienteNumero`,
// así que quedan cubiertos por el mismo mecanismo.

let A: TenantFixture

beforeAll(async () => {
  const seeded = await seedDosClinicas()
  A = seeded.A
})

describe('correlativos bajo creación concurrente', () => {
  it('dos presupuestos simultáneos obtienen números distintos (Presupuesto.numero @unique)', async () => {
    const db = tenantClient(A.dbName)
    const prest = await db.prestacion.create({ data: { nombre: 'Prestación test', precio: 1000 } })
    const items = () => [{ prestacionId: prest.id, cantidad: 1, precioUnitario: 1000, subtotal: 1000 }]

    // Sin el fix, una de las dos rechaza con violación de unique (P2002).
    const [p1, p2] = await Promise.all([
      crearPresupuesto(db, { pacienteId: A.pacienteId, total: 1000, items: items() }),
      crearPresupuesto(db, { pacienteId: A.pacienteId, total: 1000, items: items() }),
    ])

    expect(p1.numero).not.toBe(p2.numero)
    expect(new Set([p1.numero, p2.numero]).size).toBe(2)
  })

  it('dos aperturas de caja simultáneas (cajas distintas) obtienen números distintos (SesionCaja.numero)', async () => {
    const db = tenantClient(A.dbName)
    const caja1 = await db.caja.create({ data: { nombre: 'Caja concurrencia 1' } })
    const caja2 = await db.caja.create({ data: { nombre: 'Caja concurrencia 2' } })

    const [s1, s2] = await Promise.all([
      abrirSesion(db, { cajaId: caja1.id, userId: A.adminId, userNombre: 'admin', saldoApertura: 0 }),
      abrirSesion(db, { cajaId: caja2.id, userId: A.adminId, userNombre: 'admin', saldoApertura: 0 }),
    ])

    expect(s1.numero).not.toBe(s2.numero)
    expect(new Set([s1.numero, s2.numero]).size).toBe(2)
  })
})
