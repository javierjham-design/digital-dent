import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cobros = await prisma.cobro.findMany({ include: { paciente: true }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json(cobros)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const lastCobro = await prisma.cobro.findFirst({ orderBy: { numero: 'desc' } })
  const numero = (lastCobro?.numero ?? 0) + 1
  const cobro = await prisma.cobro.create({
    data: {
      pacienteId: body.pacienteId,
      numero,
      concepto: body.concepto,
      monto: body.monto,
      estado: body.estado ?? 'PENDIENTE',
      metodoPago: body.metodoPago || null,
      fechaPago: body.estado === 'PAGADO' ? new Date() : null,
    },
  })
  return NextResponse.json(cobro, { status: 201 })
}
