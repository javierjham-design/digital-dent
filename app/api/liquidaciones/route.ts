import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Lista de liquidaciones según rol:
//   - admin / puedeGestionarLiquidaciones: TODAS las liquidaciones de la clínica
//   - doctor / cualquier otro rol: SOLO las suyas
export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const canManage = u.role === 'admin' || u.puedeGestionarLiquidaciones
  const where = canManage
    ? { clinicaId: u.clinicaId }
    : { clinicaId: u.clinicaId, doctorId: u.id }

  const liquidaciones = await prisma.liquidacion.findMany({
    where,
    include: {
      doctor: { select: { id: true, name: true, email: true, especialidad: true } },
      contrato: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(liquidaciones)
}

// Crear nueva liquidación. Solo admin o usuarios con puedeGestionarLiquidaciones.
export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canManage = u.role === 'admin' || u.puedeGestionarLiquidaciones
  if (!canManage) {
    return NextResponse.json({ error: 'No tienes permiso para generar liquidaciones.' }, { status: 403 })
  }

  const body = await req.json()
  const { doctorId, periodo } = body // periodo = "2025-01"

  const contrato = await prisma.contrato.findFirst({ where: { doctorId, clinicaId: u.clinicaId, activo: true } })
  if (!contrato) return NextResponse.json({ error: 'El doctor no tiene contrato activo' }, { status: 400 })

  const [year, month] = periodo.split('-').map(Number)
  const inicio = new Date(year, month - 1, 1)
  const fin = new Date(year, month, 0, 23, 59, 59)

  const tratamientos = await prisma.tratamiento.findMany({
    where: {
      clinicaId: u.clinicaId,
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
      clinicaId: u.clinicaId,
      doctorId, contratoId: contrato.id, periodo,
      totalBruto, totalLiquidado,
      items: { create: items },
    },
    // Devolver shape COMPATIBLE con el listado del cliente: incluye _count y
    // doctor con todos los campos que la UI espera. Sin esto, el cliente
    // accede a `l._count.items` y revienta con "Cannot read 'items' of undefined".
    include: {
      doctor: { select: { id: true, name: true, email: true, especialidad: true } },
      contrato: true,
      items: true,
      _count: { select: { items: true } },
    },
  })

  return NextResponse.json(liquidacion, { status: 201 })
}
