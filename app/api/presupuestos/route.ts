import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const lastPres = await prisma.presupuesto.findFirst({ orderBy: { numero: 'desc' } })
  const numero = (lastPres?.numero ?? 0) + 1
  const presupuesto = await prisma.presupuesto.create({
    data: {
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
