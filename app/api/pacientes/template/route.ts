import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

const COLUMNAS = [
  'Nombres',
  'Apellidos',
  'Telefono',
  'Dirección',
  'Correo Electrónico',
  'RUT',
  'Fecha de Nacimiento',
]

const EJEMPLO = [
  {
    Nombres: 'Juan',
    Apellidos: 'Pérez González',
    Telefono: '+56 9 1234 5678',
    'Dirección': 'Av. Alemania 123, Temuco',
    'Correo Electrónico': 'juan.perez@example.cl',
    RUT: '12.345.678-9',
    'Fecha de Nacimiento': '1990-05-15',
  },
]

export async function GET() {
  const u = await getSessionUser()
  if (!u) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sheet = XLSX.utils.json_to_sheet(EJEMPLO, { header: COLUMNAS })
  sheet['!cols'] = [
    { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 32 },
    { wch: 28 }, { wch: 14 }, { wch: 20 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Pacientes')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-pacientes.xlsx"',
      'Cache-Control': 'no-store',
    },
  })
}
