import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Lista de cajas accesibles para el usuario actual.
// - admin: ve todas las cajas activas de la clínica
// - resto: solo las cajas que tiene asignadas y que estén activas
export async function GET() {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = u.role === 'admin'
    ? { clinicaId: u.clinicaId, activo: true }
    : { clinicaId: u.clinicaId, activo: true, usuarios: { some: { userId: u.id } } }

  const cajas = await prisma.caja.findMany({
    where,
    include: {
      usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json(cajas)
}

// Crear caja: solo admin.
export async function POST(req: NextRequest) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const body = await req.json()
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  if (!nombre) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })

  const saldoInicial = Number(body.saldoInicial) || 0
  const usuarioIds: string[] = Array.isArray(body.usuarioIds) ? body.usuarioIds : []

  // Validar usuarios pertenecen a la clínica
  if (usuarioIds.length > 0) {
    const count = await prisma.user.count({
      where: { id: { in: usuarioIds }, clinicaId: u.clinicaId },
    })
    if (count !== usuarioIds.length) {
      return NextResponse.json({ error: 'Usuarios inválidos' }, { status: 400 })
    }
  }

  try {
    const caja = await prisma.caja.create({
      data: {
        clinicaId: u.clinicaId,
        nombre,
        descripcion: body.descripcion ? String(body.descripcion) : null,
        saldoInicial,
        usuarios: {
          create: usuarioIds.map(userId => ({ userId })),
        },
      },
      include: {
        usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })
    return NextResponse.json(caja, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    if (msg.includes('Unique constraint')) {
      return NextResponse.json({ error: `Ya existe una caja "${nombre}" en esta clínica` }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
