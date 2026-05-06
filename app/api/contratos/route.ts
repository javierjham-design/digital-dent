import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const contratos = await prisma.contrato.findMany({
    include: { doctor: { select: { id: true, name: true, email: true, especialidad: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(contratos)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { doctorId, tipo, porcentaje, montoFijo, descripcion, fechaInicio, fechaFin } = body

  // Desactivar contratos anteriores del mismo doctor
  await prisma.contrato.updateMany({ where: { doctorId, activo: true }, data: { activo: false } })

  const contrato = await prisma.contrato.create({
    data: {
      doctorId, tipo,
      porcentaje: porcentaje ? Number(porcentaje) : null,
      montoFijo: montoFijo ? Number(montoFijo) : null,
      descripcion: descripcion || null,
      fechaInicio: fechaInicio ? new Date(fechaInicio) : new Date(),
      fechaFin: fechaFin ? new Date(fechaFin) : null,
      activo: true,
    },
    include: { doctor: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json(contrato, { status: 201 })
}
