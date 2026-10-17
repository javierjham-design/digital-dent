import { describe, it, expect, beforeAll } from 'vitest'
import * as XLSX from 'xlsx'
import { seedDosClinicas, type TenantFixture } from './seed'
import { tenantClient } from './tenant-test'
import { reporteCobros } from '@/services/reportes.service'

// Reportes#1: un campo "fecha-sola" (fechaPago guardada a medianoche UTC) debe caer en
// SU día civil en el reporte, no corrido un día por el shift a la zona de la clínica.
let A: TenantFixture
beforeAll(async () => { const s = await seedDosClinicas(); A = s.A })

function numeros(buffer: Buffer): number[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]])
  return rows.map((r) => Number(r['Nº'])).filter((n) => Number.isFinite(n))
}

describe('reporteCobros por fechaPago (campo fecha-sola)', () => {
  it('incluye el cobro en SU día, no en el anterior', async () => {
    const db = tenantClient(A.dbName)
    // fechaPago = 15-jul a medianoche UTC (lo que guarda `new Date("2026-07-15")`).
    await db.cobro.create({ data: { pacienteId: A.pacienteId, numero: 8101, concepto: 'x', monto: 10000, estado: 'PAGADO', fechaPago: new Date('2026-07-15') } })

    const delDia = numeros((await reporteCobros(db, { campo: 'fechaPago', desde: '2026-07-15', hasta: '2026-07-15' })).buffer)
    expect(delDia).toContain(8101)

    const delDiaAntes = numeros((await reporteCobros(db, { campo: 'fechaPago', desde: '2026-07-14', hasta: '2026-07-14' })).buffer)
    expect(delDiaAntes).not.toContain(8101)
  })
})
