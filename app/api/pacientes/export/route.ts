import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

function formatRUT(rut: string | null): string {
  if (!rut) return ''
  const clean = rut.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 2) return clean
  const body = clean.slice(0, -1)
  const dv = clean.slice(-1)
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`
}

function isoDate(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pacientes = await prisma.paciente.findMany({
    where: { clinicaId: u.clinicaId },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
  })

  const rows = pacientes.map((p) => ({
    Nombres: p.nombre,
    Apellidos: p.apellido,
    Telefono: p.telefono ?? '',
    'Dirección': p.direccion ?? '',
    'Correo Electrónico': p.email ?? '',
    RUT: formatRUT(p.rut),
    'Fecha de Nacimiento': isoDate(p.fechaNacimiento),
    'Previsión': p.prevision ?? '',
    'Género': p.genero ?? '',
    Activo: p.activo ? 'Sí' : 'No',
    'Creado': isoDate(p.createdAt),
  }))

  const sheet = XLSX.utils.json_to_sheet(rows, {
    header: [
      'Nombres', 'Apellidos', 'Telefono', 'Dirección', 'Correo Electrónico',
      'RUT', 'Fecha de Nacimiento', 'Previsión', 'Género', 'Activo', 'Creado',
    ],
  })
  sheet['!cols'] = [
    { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 32 },
    { wch: 28 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
    { wch: 12 }, { wch: 8 }, { wch: 12 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, 'Pacientes')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const fecha = new Date().toISOString().slice(0, 10)

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="pacientes-${fecha}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
