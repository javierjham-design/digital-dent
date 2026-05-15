import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildXlsx, xlsxResponse, isoDate, clp } from '@/lib/excel'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const periodo = req.nextUrl.searchParams.get('periodo')
  const doctorId = req.nextUrl.searchParams.get('doctorId')
  const estado = req.nextUrl.searchParams.get('estado')

  const liquidaciones = await prisma.liquidacion.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(periodo ? { periodo } : {}),
      ...(doctorId ? { doctorId } : {}),
      ...(estado ? { estado } : {}),
    },
    include: {
      doctor: { select: { name: true, rut: true } },
      contrato: { select: { tipo: true, porcentaje: true, montoFijo: true } },
      _count: { select: { items: true } },
    },
    orderBy: [{ periodo: 'desc' }, { doctorId: 'asc' }],
  })

  const buf = buildXlsx(
    liquidaciones,
    [
      { header: 'Periodo', width: 10, value: (l) => l.periodo },
      { header: 'Doctor', width: 28, value: (l) => l.doctor?.name ?? '' },
      { header: 'RUT doctor', width: 14, value: (l) => l.doctor?.rut ?? '' },
      { header: 'Tipo contrato', width: 14, value: (l) => l.contrato?.tipo ?? '' },
      { header: 'Porcentaje', width: 10, value: (l) => l.contrato?.porcentaje ?? '' },
      { header: 'Monto fijo', width: 12, value: (l) => clp(l.contrato?.montoFijo ?? 0) },
      { header: 'Tratamientos', width: 12, value: (l) => l._count.items },
      { header: 'Total bruto', width: 14, value: (l) => clp(l.totalBruto) },
      { header: 'Total liquidado', width: 14, value: (l) => clp(l.totalLiquidado) },
      { header: 'Estado', width: 12, value: (l) => l.estado },
      { header: 'Fecha pago', width: 14, value: (l) => isoDate(l.fechaPago) },
      { header: 'Creada', width: 14, value: (l) => isoDate(l.createdAt) },
      { header: 'Notas', width: 32, value: (l) => l.notas ?? '' },
    ],
    'Liquidaciones',
  )

  return xlsxResponse(buf, 'liquidaciones')
}
