import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cobros = await prisma.cobro.findMany({
    include: {
      paciente: true,
      medioPago: true,
      reciboUsuario: { select: { id: true, name: true, email: true } },
      items: { include: { tratamiento: { include: { prestacion: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(cobros)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  const items: { tratamientoId?: string; descripcion: string; monto: number }[] = body.items ?? []
  const monto = items.reduce((sum, i) => sum + Number(i.monto), 0)

  let comisionMonto = 0
  let montoNeto = monto
  if (body.medioPagoId) {
    const medio = await prisma.medioPago.findUnique({ where: { id: body.medioPagoId } })
    if (medio) {
      comisionMonto = monto * (medio.comision / 100)
      montoNeto = monto - comisionMonto
    }
  }

  const concepto = items.map((i) => i.descripcion).join(', ')
  const lastCobro = await prisma.cobro.findFirst({ orderBy: { numero: 'desc' } })
  const numero = (lastCobro?.numero ?? 0) + 1

  const cobro = await prisma.cobro.create({
    data: {
      pacienteId:      body.pacienteId,
      numero,
      concepto,
      monto,
      montoNeto,
      comisionMonto,
      estado:          'PAGADO',
      medioPagoId:     body.medioPagoId     || null,
      reciboUsuarioId: body.reciboUsuarioId || null,
      fechaPago:       new Date(),
      notas:           body.notas           || null,
      items: {
        create: items.map((i) => ({
          tratamientoId: i.tratamientoId || null,
          descripcion:   i.descripcion,
          monto:         Number(i.monto),
        })),
      },
    },
    include: {
      paciente: true,
      medioPago: true,
      reciboUsuario: { select: { id: true, name: true, email: true } },
      items: true,
    },
  })
  return NextResponse.json(cobro, { status: 201 })
}
