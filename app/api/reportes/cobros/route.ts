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
  const usarFechaPago = req.nextUrl.searchParams.get('campo') === 'fechaPago'

  const filtroFecha = (desde || hasta)
    ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) }
    : null

  const cobros = await prisma.cobro.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(estado ? { estado } : {}),
      ...(filtroFecha
        ? usarFechaPago
          ? { fechaPago: filtroFecha }
          : { createdAt: filtroFecha }
        : {}),
    },
    include: {
      paciente: { select: { nombre: true, apellido: true, rut: true } },
      medioPago: { select: { nombre: true } },
      reciboUsuario: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const buf = buildXlsx(
    cobros,
    [
      { header: 'Nº', width: 8, value: (c) => c.numero },
      { header: 'Fecha creación', width: 14, value: (c) => isoDate(c.createdAt) },
      { header: 'Fecha pago', width: 14, value: (c) => isoDate(c.fechaPago) },
      { header: 'Paciente', width: 28, value: (c) => `${c.paciente.nombre} ${c.paciente.apellido}` },
      { header: 'RUT', width: 14, value: (c) => c.paciente.rut ?? '' },
      { header: 'Concepto', width: 32, value: (c) => c.concepto },
      { header: 'Monto', width: 12, value: (c) => clp(c.monto) },
      { header: 'Monto neto', width: 12, value: (c) => clp(c.montoNeto ?? c.monto) },
      { header: 'Comisión', width: 10, value: (c) => clp(c.comisionMonto ?? 0) },
      { header: 'Estado', width: 12, value: (c) => c.estado },
      { header: 'Medio de pago', width: 16, value: (c) => c.medioPago?.nombre ?? c.metodoPago ?? '' },
      { header: 'Recibió', width: 22, value: (c) => c.reciboUsuario?.name ?? '' },
      { header: 'Notas', width: 32, value: (c) => c.notas ?? '' },
    ],
    'Cobros',
  )

  return xlsxResponse(buf, 'cobros')
}
