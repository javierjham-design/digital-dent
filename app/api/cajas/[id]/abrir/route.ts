import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { abrirSesion, calcularSaldoSugerido, getSesionAbierta } from '@/lib/caja'

// Abre una nueva sesión de caja con el saldo de apertura declarado por el
// usuario. Operación explícita: nadie debe abrir cajas sin haber contado.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
  if (!caja.activo) return NextResponse.json({ error: 'La caja está inactiva.' }, { status: 409 })
  const isAdmin = u.role === 'admin'
  const isMiembro = caja.usuarios.some(cu => cu.userId === u.id)
  if (!isAdmin && !isMiembro) {
    return NextResponse.json({ error: 'No tienes acceso a esta caja.' }, { status: 403 })
  }

  const existing = await getSesionAbierta(id)
  if (existing) {
    return NextResponse.json({ error: 'Ya hay una sesión abierta en esta caja.' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  // Si el cliente no envía monto explícito, usamos el saldo sugerido
  // (saldoReal del último cierre o saldoInicial). Si envía 0 explícito,
  // se respeta — puede ser intencional para empezar de cero.
  let saldoApertura: number
  if (body.saldoApertura === undefined || body.saldoApertura === null || body.saldoApertura === '') {
    saldoApertura = await calcularSaldoSugerido(id)
  } else {
    saldoApertura = Number(body.saldoApertura)
  }
  if (!Number.isFinite(saldoApertura) || saldoApertura < 0) {
    return NextResponse.json({ error: 'El saldo de apertura es inválido.' }, { status: 400 })
  }

  try {
    const sesion = await abrirSesion({
      cajaId: id,
      clinicaId: u.clinicaId,
      userId: u.id,
      userNombre: u.name ?? u.email,
      saldoApertura,
    })
    return NextResponse.json(sesion, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo abrir la caja.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }
}

// Permite al cliente consultar el saldo sugerido sin abrir todavía.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return NextResponse.json({ error: 'Caja no encontrada' }, { status: 404 })
  if (u.role !== 'admin' && !caja.usuarios.some(cu => cu.userId === u.id)) {
    return NextResponse.json({ error: 'No tienes acceso a esta caja.' }, { status: 403 })
  }

  const saldoSugerido = await calcularSaldoSugerido(id)
  return NextResponse.json({ saldoSugerido })
}
