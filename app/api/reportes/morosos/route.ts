import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildXlsx, xlsxResponse, formatRUT, isoDate, clp } from '@/lib/excel'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const diasMin = Number(req.nextUrl.searchParams.get('diasMin') ?? 0)

  const cobros = await prisma.cobro.findMany({
    where: {
      clinicaId: u.clinicaId,
      estado: 'PENDIENTE',
    },
    include: {
      paciente: {
        select: { id: true, nombre: true, apellido: true, rut: true, telefono: true, email: true },
      },
    },
  })

  const ahora = Date.now()
  const porPaciente = new Map<string, {
    paciente: { id: string; nombre: string; apellido: string; rut: string | null; telefono: string | null; email: string | null }
    montoTotal: number
    cobrosCount: number
    cobroMasAntiguo: Date
  }>()

  for (const c of cobros) {
    const key = c.paciente.id
    const prev = porPaciente.get(key)
    if (prev) {
      prev.montoTotal += c.monto
      prev.cobrosCount += 1
      if (c.createdAt < prev.cobroMasAntiguo) prev.cobroMasAntiguo = c.createdAt
    } else {
      porPaciente.set(key, {
        paciente: c.paciente,
        montoTotal: c.monto,
        cobrosCount: 1,
        cobroMasAntiguo: c.createdAt,
      })
    }
  }

  const rows = Array.from(porPaciente.values())
    .map((r) => ({
      ...r,
      diasMora: Math.floor((ahora - r.cobroMasAntiguo.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .filter((r) => r.diasMora >= diasMin)
    .sort((a, b) => b.diasMora - a.diasMora)

  const buf = buildXlsx(
    rows,
    [
      { header: 'Paciente', width: 28, value: (r) => `${r.paciente.nombre} ${r.paciente.apellido}` },
      { header: 'RUT', width: 14, value: (r) => formatRUT(r.paciente.rut) },
      { header: 'Teléfono', width: 16, value: (r) => r.paciente.telefono ?? '' },
      { header: 'Correo', width: 28, value: (r) => r.paciente.email ?? '' },
      { header: 'Cobros pendientes', width: 14, value: (r) => r.cobrosCount },
      { header: 'Monto adeudado', width: 16, value: (r) => clp(r.montoTotal) },
      { header: 'Cobro más antiguo', width: 16, value: (r) => isoDate(r.cobroMasAntiguo) },
      { header: 'Días mora', width: 12, value: (r) => r.diasMora },
    ],
    'Morosos',
  )

  return xlsxResponse(buf, 'morosos')
}
