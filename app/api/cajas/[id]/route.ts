import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

async function checkAccess(cajaId: string, userId: string, role: string, clinicaId: string) {
  const caja = await prisma.caja.findFirst({
    where: { id: cajaId, clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) return { ok: false as const, caja: null }
  if (role === 'admin') return { ok: true as const, caja }
  const can = caja.usuarios.some(cu => cu.userId === userId)
  return { ok: can, caja }
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const access = await checkAccess(id, u.id, u.role, u.clinicaId)
  if (!access.caja) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.ok) return NextResponse.json({ error: 'No tienes acceso a esta caja' }, { status: 403 })

  const cajaFull = await prisma.caja.findUnique({
    where: { id },
    include: {
      usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  return NextResponse.json(cajaFull)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const { id } = await params

  const existing = await prisma.caja.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (body.nombre !== undefined) data.nombre = String(body.nombre).trim()
  if (body.descripcion !== undefined) data.descripcion = body.descripcion ? String(body.descripcion) : null
  if (body.saldoInicial !== undefined) {
    const n = Number(body.saldoInicial)
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'saldoInicial inválido' }, { status: 400 })
    data.saldoInicial = n
  }
  if (body.activo !== undefined) data.activo = Boolean(body.activo)

  // Reasignar usuarios autorizados
  if (Array.isArray(body.usuarioIds)) {
    const usuarioIds = body.usuarioIds as string[]
    if (usuarioIds.length > 0) {
      const count = await prisma.user.count({
        where: { id: { in: usuarioIds }, clinicaId: u.clinicaId },
      })
      if (count !== usuarioIds.length) {
        return NextResponse.json({ error: 'Usuarios inválidos' }, { status: 400 })
      }
    }
    await prisma.cajaUsuario.deleteMany({ where: { cajaId: id } })
    if (usuarioIds.length > 0) {
      await prisma.cajaUsuario.createMany({
        data: usuarioIds.map(userId => ({ cajaId: id, userId })),
      })
    }
  }

  const caja = await prisma.caja.update({
    where: { id },
    data,
    include: {
      usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  return NextResponse.json(caja)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (u.role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
  const { id } = await params

  const existing = await prisma.caja.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Soft delete: marcar inactivo (no borramos porque hay historial)
  await prisma.caja.update({ where: { id }, data: { activo: false } })
  return NextResponse.json({ ok: true })
}
