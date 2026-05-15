import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildXlsx, xlsxResponse, isoDate, clp, parseDateRange } from '@/lib/excel'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)
  const estado = req.nextUrl.searchParams.get('estado')
  const doctorId = req.nextUrl.searchParams.get('doctorId')
  const usarFechaCompletado = req.nextUrl.searchParams.get('campo') === 'fechaCompletado'

  const filtroFecha = (desde || hasta)
    ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) }
    : null

  const tratamientos = await prisma.tratamiento.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(estado ? { estado } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(filtroFecha
        ? usarFechaCompletado
          ? { fechaCompletado: filtroFecha }
          : { fecha: filtroFecha }
        : {}),
    },
    include: {
      prestacion: { select: { nombre: true, categoria: true } },
      doctor: { select: { name: true } },
      ficha: {
        select: {
          paciente: { select: { nombre: true, apellido: true, rut: true } },
        },
      },
    },
    orderBy: { fecha: 'desc' },
  })

  const buf = buildXlsx(
    tratamientos,
    [
      { header: 'Fecha plan.', width: 14, value: (t) => isoDate(t.fecha) },
      { header: 'Fecha completado', width: 16, value: (t) => isoDate(t.fechaCompletado) },
      { header: 'Paciente', width: 28, value: (t) => `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}` },
      { header: 'RUT', width: 14, value: (t) => t.ficha.paciente.rut ?? '' },
      { header: 'Prestación', width: 28, value: (t) => t.prestacion.nombre },
      { header: 'Categoría', width: 16, value: (t) => t.prestacion.categoria ?? '' },
      { header: 'Pieza', width: 8, value: (t) => t.diente ?? '' },
      { header: 'Cara', width: 8, value: (t) => t.cara ?? '' },
      { header: 'Doctor', width: 24, value: (t) => t.doctor?.name ?? '' },
      { header: 'Estado', width: 14, value: (t) => t.estado },
      { header: 'Precio', width: 12, value: (t) => clp(t.precio) },
      { header: 'Notas', width: 32, value: (t) => t.notas ?? '' },
    ],
    'Tratamientos',
  )

  return xlsxResponse(buf, 'tratamientos')
}
