import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const liquidaciones = await prisma.liquidacion.findMany({
    include: { doctor: { select: { id: true, name: true, email: true, especialidad: true } }, contrato: true, _count: { select: { items: true } } },
    orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(liquidaciones)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { doctorId, periodo } = body // periodo = "2025-01"

  const contrato = await prisma.contrato.findFirst({ where: { doctorId, activo: true } })
  if (!contrato) return NextResponse.json({ error: 'El doctor no tiene contrato activo' }, { status: 400 })

  const [year, month] = periodo.split('-').map(Number)
  const inicio = new Date(year, month - 1, 1)
  const fin = new Date(year, month, 0, 23, 59, 59)

  const tratamientos = await prisma.tratamiento.findMany({
    where: {
      doctorId,
      estado: 'COMPLETADO',
      fechaCompletado: { gte: inicio, lte: fin },
      liquidacionItems: { none: {} },
    },
    include: {
      prestacion: true,
      ficha: { include: { paciente: true } },
    },
  })

  if (tratamientos.length === 0) return NextResponse.json({ error: 'No hay tratamientos completados en este período sin liquidar' }, { status: 400 })

  const items = tratamientos.map((t) => {
    const monto = contrato.tipo === 'PORCENTAJE'
      ? t.precio * (contrato.porcentaje! / 100)
      : contrato.montoFijo!
    return {
      tratamientoId: t.id,
      prestacionNombre: t.prestacion.nombre,
      pacienteNombre: `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}`,
      diente: t.diente ? `Pieza ${t.diente}` : (t.cara ?? null),
      fechaCompletado: t.fechaCompletado!,
      precioTratamiento: t.precio,
      porcentajeAplicado: contrato.tipo === 'PORCENTAJE' ? contrato.porcentaje : null,
      montoFijoAplicado: contrato.tipo === 'MONTO_FIJO' ? contrato.montoFijo : null,
      montoLiquidado: monto,
    }
  })

  const totalBruto = tratamientos.reduce((s, t) => s + t.precio, 0)
  const totalLiquidado = items.reduce((s, i) => s + i.montoLiquidado, 0)

  const liquidacion = await prisma.liquidacion.create({
    data: {
      doctorId, contratoId: contrato.id, periodo,
      totalBruto, totalLiquidado,
      items: { create: items },
    },
    include: { doctor: { select: { id: true, name: true, email: true } }, contrato: true, items: true },
  })

  return NextResponse.json(liquidacion, { status: 201 })
}
