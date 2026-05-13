import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  const paciente = await prisma.paciente.findFirst({ where: { id: body.pacienteId, clinicaId: u.clinicaId }, select: { id: true } })
  if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

  const lastPres = await prisma.presupuesto.findFirst({
    where: { clinicaId: u.clinicaId },
    orderBy: { numero: 'desc' },
  })
  const numero = (lastPres?.numero ?? 0) + 1

  const presupuesto = await prisma.presupuesto.create({
    data: {
      clinicaId: u.clinicaId,
      pacienteId: body.pacienteId,
      numero,
      total: body.total,
      items: {
        create: body.items.map((item: any) => ({
          prestacionId: item.prestacionId,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario,
          descuento: item.descuento ?? 0,
          subtotal: item.subtotal,
        })),
      },
    },
  })
  return NextResponse.json(presupuesto, { status: 201 })
}
