import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const cobros = await prisma.cobro.findMany({
    where: { clinicaId: u.clinicaId },
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
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Permiso: solo usuarios habilitados como caja pueden registrar cobros.
  const me = await prisma.user.findUnique({
    where: { id: u.id },
    select: { role: true, puedeRecibirPagos: true, name: true, email: true },
  })
  const canReceive = me?.role === 'admin' || me?.puedeRecibirPagos
  if (!canReceive) {
    return NextResponse.json({ error: 'No tienes permiso para recibir pagos.' }, { status: 403 })
  }

  const body = await req.json()

  const paciente = await prisma.paciente.findFirst({ where: { id: body.pacienteId, clinicaId: u.clinicaId }, select: { id: true, nombre: true, apellido: true } })
  if (!paciente) return NextResponse.json({ error: 'Paciente no encontrado' }, { status: 404 })

  // Caja: obligatoria. Debe pertenecer a la clínica y el usuario debe poder operarla.
  const cajaId = typeof body.cajaId === 'string' ? body.cajaId : ''
  if (!cajaId) return NextResponse.json({ error: 'Debes seleccionar una caja.' }, { status: 400 })
  const caja = await prisma.caja.findFirst({
    where: { id: cajaId, clinicaId: u.clinicaId, activo: true },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
  if (me?.role !== 'admin' && !caja.usuarios.some(cu => cu.userId === u.id)) {
    return NextResponse.json({ error: 'No tienes acceso a esta caja.' }, { status: 403 })
  }

  const items: { tratamientoId?: string; descripcion: string; monto: number }[] = body.items ?? []
  if (items.length === 0) return NextResponse.json({ error: 'Agrega al menos un item.' }, { status: 400 })
  const monto = items.reduce((sum, i) => sum + Number(i.monto), 0)
  if (monto <= 0) return NextResponse.json({ error: 'El monto debe ser mayor a 0.' }, { status: 400 })

  let comisionMonto = 0
  let montoNeto = monto
  if (body.medioPagoId) {
    const medio = await prisma.medioPago.findFirst({ where: { id: body.medioPagoId, clinicaId: u.clinicaId } })
    if (medio) {
      comisionMonto = monto * (medio.comision / 100)
      montoNeto = monto - comisionMonto
    }
  }

  const concepto = items.map((i) => i.descripcion).join(', ')
  const lastCobro = await prisma.cobro.findFirst({
    where: { clinicaId: u.clinicaId },
    orderBy: { numero: 'desc' },
  })
  const numero = (lastCobro?.numero ?? 0) + 1
  const fechaPago = body.fechaPago ? new Date(body.fechaPago) : new Date()

  // Cobro + MovimientoCaja en una transacción.
  const cobro = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.cobro.create({
      data: {
        clinicaId:       u.clinicaId,
        pacienteId:      body.pacienteId,
        numero,
        concepto,
        monto,
        montoNeto,
        comisionMonto,
        estado:          'PAGADO',
        medioPagoId:     body.medioPagoId     || null,
        reciboUsuarioId: body.reciboUsuarioId || u.id,
        cajaId:          caja.id,
        fechaPago,
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

    await tx.movimientoCaja.create({
      data: {
        clinicaId:    u.clinicaId!,
        cajaId:       caja.id,
        tipo:         'INGRESO',
        // El ingreso a caja es el neto (lo que efectivamente entra) — la comisión
        // del medio de pago se descuenta antes de tocar la caja.
        monto:        montoNeto,
        descripcion:  `Cobro #${numero} · ${paciente.nombre} ${paciente.apellido}`,
        categoria:    'COBRO',
        fecha:        fechaPago,
        cobroId:      nuevo.id,
        userId:       u.id,
      },
    })

    return nuevo
  })

  return NextResponse.json(cobro, { status: 201 })
}
