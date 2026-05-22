import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdmin } from '@/lib/auth'
import { calcularProximoCobro, type CicloFacturacion } from '@/lib/billing'

export const dynamic = 'force-dynamic'

const METODOS_VALIDOS = ['TRANSFERENCIA', 'WEBPAY', 'EFECTIVO', 'OTRO']

// GET /api/admin/clinicas/[id]/pagos — lista pagos de la clínica
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const pagos = await prisma.pagoSuscripcion.findMany({
    where: { clinicaId: id },
    orderBy: { fechaPago: 'desc' },
  })
  return NextResponse.json({ pagos })
}

// POST /api/admin/clinicas/[id]/pagos — registra un pago
// Body: { monto: number, fechaPago?: string, metodoPago: string,
//         periodoDesde?: string, periodoHasta?: string,
//         comprobante?: string, notas?: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const monto = Number(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: 'monto debe ser un número positivo' }, { status: 400 })
  }

  const metodoPago = typeof body.metodoPago === 'string' ? body.metodoPago : ''
  if (!METODOS_VALIDOS.includes(metodoPago)) {
    return NextResponse.json({ error: `metodoPago debe ser uno de: ${METODOS_VALIDOS.join(', ')}` }, { status: 400 })
  }

  const clinica = await prisma.clinica.findUnique({ where: { id } })
  if (!clinica) return NextResponse.json({ error: 'Clínica no existe' }, { status: 404 })

  const fechaPago = body.fechaPago ? new Date(body.fechaPago) : new Date()
  const ciclo = (clinica.cicloFacturacion as CicloFacturacion) || 'MENSUAL'

  // Si no especifican periodo, lo calculamos: desde el último proximoCobro (o fechaPago)
  // hasta el siguiente vencimiento.
  const periodoDesde = body.periodoDesde
    ? new Date(body.periodoDesde)
    : (clinica.proximoCobro && clinica.proximoCobro.getTime() > fechaPago.getTime()
        ? new Date(clinica.proximoCobro)
        : new Date(fechaPago))

  const periodoHasta = body.periodoHasta
    ? new Date(body.periodoHasta)
    : calcularProximoCobro({ proximoActual: clinica.proximoCobro, fechaPago, ciclo })

  const nuevoProximoCobro = calcularProximoCobro({
    proximoActual: clinica.proximoCobro,
    fechaPago,
    ciclo,
  })

  const [pago, clinicaActualizada] = await prisma.$transaction([
    prisma.pagoSuscripcion.create({
      data: {
        clinicaId: id,
        fechaPago,
        monto,
        periodoDesde,
        periodoHasta,
        metodoPago,
        comprobante: body.comprobante ?? null,
        notas: body.notas ?? null,
        registradoPor: admin.id,
      },
    }),
    prisma.clinica.update({
      where: { id },
      data: {
        proximoCobro: nuevoProximoCobro,
        activo: true, // si estaba suspendida por mora, se reactiva
        // si era trial y registran pago, pasa a BASICO por default (salvo que ya esté en plan pagado)
        plan: clinica.plan === 'TRIAL' ? 'BASICO' : clinica.plan,
      },
    }),
  ])

  return NextResponse.json({ ok: true, pago, clinica: clinicaActualizada })
}
