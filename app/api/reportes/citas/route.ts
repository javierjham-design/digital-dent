import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildXlsx, xlsxResponse, isoDate, isoDateTime, parseDateRange } from '@/lib/excel'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)
  const estado = req.nextUrl.searchParams.get('estado')

  const citas = await prisma.cita.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(desde || hasta
        ? { fecha: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
        : {}),
      ...(estado ? { estado } : {}),
    },
    include: {
      paciente: { select: { nombre: true, apellido: true, rut: true, telefono: true } },
      doctor: { select: { name: true } },
    },
    orderBy: { fecha: 'asc' },
  })

  const buf = buildXlsx(
    citas,
    [
      { header: 'Fecha', width: 12, value: (c) => isoDate(c.fecha) },
      { header: 'Hora', width: 8, value: (c) => isoDateTime(c.fecha).slice(11) },
      { header: 'Duración (min)', width: 12, value: (c) => c.duracion },
      { header: 'Paciente', width: 28, value: (c) => `${c.paciente.nombre} ${c.paciente.apellido}` },
      { header: 'RUT', width: 14, value: (c) => c.paciente.rut ?? '' },
      { header: 'Teléfono', width: 16, value: (c) => c.paciente.telefono ?? '' },
      { header: 'Doctor', width: 24, value: (c) => c.doctor?.name ?? '' },
      { header: 'Tipo', width: 16, value: (c) => c.tipo ?? '' },
      { header: 'Estado', width: 14, value: (c) => c.estado },
      { header: 'Sala', width: 10, value: (c) => c.sala ?? '' },
      { header: 'WA confirmado', width: 14, value: (c) => (c.confirmadoWA ? 'Sí' : 'No') },
      { header: 'Notas', width: 32, value: (c) => c.notas ?? '' },
    ],
    'Citas',
  )

  return xlsxResponse(buf, 'citas')
}
