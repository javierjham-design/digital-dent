import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const contratos = await prisma.contrato.findMany({
    where: { clinicaId: u.clinicaId },
    include: { doctor: { select: { id: true, name: true, email: true, especialidad: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(contratos)
}

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { doctorId, tipo, porcentaje, montoFijo, descripcion, fechaInicio, fechaFin } = body

  const doctor = await prisma.user.findFirst({ where: { id: doctorId, clinicaId: u.clinicaId }, select: { id: true } })
  if (!doctor) return NextResponse.json({ error: 'Doctor no encontrado' }, { status: 404 })

  await prisma.contrato.updateMany({ where: { doctorId, clinicaId: u.clinicaId, activo: true }, data: { activo: false } })

  const contrato = await prisma.contrato.create({
    data: {
      clinicaId: u.clinicaId,
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
