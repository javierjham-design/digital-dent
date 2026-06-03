import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Detalle de una liquidación. Acceso:
//   - admin / puedeGestionarLiquidaciones: cualquiera de su clínica
//   - cualquier otro rol: SOLO si es su propia liquidación
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const canManage = u.role === 'admin' || u.puedeGestionarLiquidaciones
  const liquidacion = await prisma.liquidacion.findFirst({
    where: canManage
      ? { id, clinicaId: u.clinicaId }
      : { id, clinicaId: u.clinicaId, doctorId: u.id },
    include: {
      doctor: { select: { id: true, name: true, email: true, rut: true, especialidad: true } },
      contrato: true,
      items: { orderBy: { fechaCompletado: 'asc' } },
    },
  })
  if (!liquidacion) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })
  return NextResponse.json(liquidacion)
}

const ESTADOS_LIQ = ['BORRADOR', 'APROBADA', 'PAGADA']

// Cambiar estado de una liquidación. Solo admin / puedeGestionarLiquidaciones.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const canManage = u.role === 'admin' || u.puedeGestionarLiquidaciones
  if (!canManage) {
    return NextResponse.json({ error: 'No tienes permiso para gestionar liquidaciones.' }, { status: 403 })
  }
  const { id } = await params
  const existing = await prisma.liquidacion.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.estado !== undefined) {
    if (!ESTADOS_LIQ.includes(body.estado)) {
      return NextResponse.json({ error: `estado inválido. Use: ${ESTADOS_LIQ.join(', ')}` }, { status: 400 })
    }
    data.estado = body.estado
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null

  // Devolver el shape que el cliente espera (incluye doctor, contrato y _count)
  // para que setLiquidaciones(...spread) no rompa el render.
  const liquidacion = await prisma.liquidacion.update({
    where: { id },
    data,
    include: {
      doctor: { select: { id: true, name: true, email: true, especialidad: true } },
      contrato: true,
      _count: { select: { items: true } },
    },
  })
  return NextResponse.json(liquidacion)
}
