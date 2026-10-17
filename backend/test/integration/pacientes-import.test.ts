import { describe, it, expect, beforeAll } from 'vitest'
import * as XLSX from 'xlsx'
import { seedDosClinicas } from './seed'
import { tenantClient } from './tenant-test'
import { importarPacientes } from '@/services/pacientes.service'

// Import de pacientes (H14/M15/M16): el RUT se normaliza igual que el alta manual (con puntos +
// DV validado) para no duplicar fichas, y cada ficha importada recibe su número correlativo.
let dbName = ''
beforeAll(async () => {
  const seeded = await seedDosClinicas()
  dbName = seeded.A.dbName
  const db = tenantClient(dbName)
  await db.configuracion.update({ where: { id: 'singleton' }, data: { pais: 'CL' } }).catch(() => {})
})

function xlsxBuffer(rows: Record<string, unknown>[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('importarPacientes', () => {
  it('normaliza el RUT con puntos (como el alta manual) y asigna número ≥ 1000', async () => {
    const db = tenantClient(dbName)
    const r = await importarPacientes(db, xlsxBuffer([{ Nombres: 'Juan', Apellidos: 'Perez', RUT: '11111111-1' }]))
    expect(r.creados).toBe(1)
    const p = await db.paciente.findFirst({ where: { nombre: 'Juan', apellido: 'Perez' } })
    expect(p?.rut).toBe('11.111.111-1')
    expect(p?.numero ?? 0).toBeGreaterThanOrEqual(1000)
    expect(p?.activo).toBe(true)
  })

  it('rechaza un RUT con dígito verificador inválido (no lo crea)', async () => {
    const db = tenantClient(dbName)
    const r = await importarPacientes(db, xlsxBuffer([{ Nombres: 'Mal', Apellidos: 'Dv', RUT: '11111111-9' }]))
    expect(r.creados).toBe(0)
    expect(r.errores.length).toBe(1)
    expect(await db.paciente.findFirst({ where: { nombre: 'Mal', apellido: 'Dv' } })).toBeNull()
  })

  it('no duplica un paciente ya existente (mismo RUT, formato con puntos)', async () => {
    const db = tenantClient(dbName)
    await importarPacientes(db, xlsxBuffer([{ Nombres: 'Ana', Apellidos: 'Soto', RUT: '22222222-2' }]))
    const r2 = await importarPacientes(db, xlsxBuffer([{ Nombres: 'Ana', Apellidos: 'Soto', RUT: '22.222.222-2' }]))
    expect(r2.creados).toBe(0)
    expect(r2.duplicados).toBe(1)
    expect(await db.paciente.count({ where: { rut: '22.222.222-2' } })).toBe(1)
  })
})
