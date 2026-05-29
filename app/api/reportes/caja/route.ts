import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildXlsx, xlsxResponse, isoDate, clp, parseDateRange } from '@/lib/excel'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { desde, hasta } = parseDateRange(req.nextUrl.searchParams)
  const cajaId = req.nextUrl.searchParams.get('cajaId')

  const filtroFecha = (desde || hasta)
    ? { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) }
    : null

  const movs = await prisma.movimientoCaja.findMany({
    where: {
      clinicaId: u.clinicaId,
      ...(cajaId ? { cajaId } : {}),
      ...(filtroFecha ? { fecha: filtroFecha } : {}),
    },
    include: {
      caja: { select: { nombre: true } },
      user: { select: { name: true, email: true } },
      cobro: { select: { numero: true, paciente: { select: { nombre: true, apellido: true } } } },
    },
    orderBy: { fecha: 'desc' },
  })

  const buf = buildXlsx(
    movs,
    [
      { header: 'Fecha', width: 16, value: (m) => isoDate(m.fecha) },
      { header: 'Caja', width: 18, value: (m) => m.caja.nombre },
      { header: 'Tipo', width: 10, value: (m) => m.tipo },
      { header: 'Categoría', width: 14, value: (m) => m.categoria ?? '' },
      { header: 'Descripción', width: 36, value: (m) => m.descripcion },
      { header: 'Cobro #', width: 10, value: (m) => m.cobro?.numero ?? '' },
      { header: 'Paciente', width: 26, value: (m) => m.cobro ? `${m.cobro.paciente.nombre} ${m.cobro.paciente.apellido}` : '' },
      { header: 'Monto', width: 12, value: (m) => clp(m.monto) },
      { header: 'Anulado', width: 10, value: (m) => m.anulado ? 'Sí' : '' },
      { header: 'Motivo anulación', width: 30, value: (m) => m.motivoAnulacion ?? '' },
      { header: 'Registrado por', width: 22, value: (m) => m.user.name ?? m.user.email ?? '' },
    ],
    'Caja',
  )
  return xlsxResponse(buf, 'movimientos-caja')
}
