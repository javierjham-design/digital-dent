import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { ensureSesionAbierta } from '@/lib/caja'

const CATEGORIAS_EGRESO = ['ARRIENDO', 'INSUMOS', 'SUELDO', 'SERVICIOS', 'RETIRO', 'OTRO']

async function checkCajaAccess(cajaId: string, userId: string, role: string, clinicaId: string) {
  const caja = await prisma.caja.findFirst({
    where: { id: cajaId, clinicaId },
    select: {
      id: true, activo: true,
      usuarios: { select: { userId: true } },
    },
  })
  if (!caja) return null
  if (!caja.activo) return null
  if (role === 'admin') return caja
  if (caja.usuarios.some(cu => cu.userId === userId)) return caja
  return null
}

// Lista movimientos de la caja en un período.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const caja = await checkCajaAccess(id, u.id, u.role, u.clinicaId)
  if (!caja) return NextResponse.json({ error: 'No tienes acceso a esta caja' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where = {
    cajaId: id,
    ...(from && to ? { fecha: { gte: new Date(from), lte: new Date(to + 'T23:59:59') } } : {}),
  }
  const movs = await prisma.movimientoCaja.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: { select: { id: true, numero: true, paciente: { select: { nombre: true, apellido: true } } } },
    },
    orderBy: { fecha: 'desc' },
  })
  return NextResponse.json(movs)
}

// Registrar un movimiento manual (EGRESO o INGRESO ajustado).
// Los ingresos por cobro NO se registran aquí — se generan automáticamente en POST /api/cobros.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const caja = await checkCajaAccess(id, u.id, u.role, u.clinicaId)
  if (!caja) return NextResponse.json({ error: 'No tienes acceso a esta caja' }, { status: 403 })

  const body = await req.json()
  const tipo = body.tipo === 'INGRESO' ? 'INGRESO' : 'EGRESO'
  const monto = Math.abs(Number(body.monto))
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: 'monto inválido' }, { status: 400 })
  }
  const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : ''
  if (!descripcion) return NextResponse.json({ error: 'Falta la descripción' }, { status: 400 })

  const categoria = body.categoria && typeof body.categoria === 'string'
    ? (tipo === 'EGRESO' && !CATEGORIAS_EGRESO.includes(body.categoria) ? 'OTRO' : body.categoria)
    : (tipo === 'EGRESO' ? 'OTRO' : null)

  const fecha = body.fecha ? new Date(body.fecha) : new Date()

  const sesion = await ensureSesionAbierta({
    cajaId: id,
    clinicaId: u.clinicaId,
    userId: u.id,
    userNombre: u.name ?? u.email,
  })

  const mov = await prisma.movimientoCaja.create({
    data: {
      clinicaId: u.clinicaId,
      cajaId: id,
      sesionCajaId: sesion.id,
      tipo,
      monto,
      descripcion,
      categoria,
      fecha,
      userId: u.id,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })
  return NextResponse.json(mov, { status: 201 })
}
