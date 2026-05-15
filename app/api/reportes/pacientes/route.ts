import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildXlsx, xlsxResponse, formatRUT, isoDate, parseDateRange } from '@/lib/excel'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)
  const soloActivos = req.nextUrl.searchParams.get('soloActivos') === '1'

  const pacientes = await prisma.paciente.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(soloActivos ? { activo: true } : {}),
      ...(desde || hasta
        ? { createdAt: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
        : {}),
    },
    orderBy: [{ apellido: 'asc' }, { nombre: 'asc' }],
  })

  const buf = buildXlsx(
    pacientes,
    [
      { header: 'Nombres', width: 18, value: (p) => p.nombre },
      { header: 'Apellidos', width: 22, value: (p) => p.apellido },
      { header: 'RUT', width: 14, value: (p) => formatRUT(p.rut) },
      { header: 'Teléfono', width: 16, value: (p) => p.telefono ?? '' },
      { header: 'Correo', width: 28, value: (p) => p.email ?? '' },
      { header: 'Dirección', width: 32, value: (p) => p.direccion ?? '' },
      { header: 'Fecha nacimiento', width: 16, value: (p) => isoDate(p.fechaNacimiento) },
      { header: 'Previsión', width: 14, value: (p) => p.prevision ?? '' },
      { header: 'Género', width: 10, value: (p) => p.genero ?? '' },
      { header: 'Activo', width: 8, value: (p) => (p.activo ? 'Sí' : 'No') },
      { header: 'Creado', width: 12, value: (p) => isoDate(p.createdAt) },
    ],
    'Pacientes',
  )

  return xlsxResponse(buf, 'pacientes')
}
