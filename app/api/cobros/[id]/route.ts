import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

const ESTADOS = ['PENDIENTE', 'PAGADO', 'PARCIAL', 'ANULADO']

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const cobro = await prisma.cobro.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      paciente: true,
      medioPago: true,
      reciboUsuario: { select: { id: true, name: true, email: true } },
      items: { include: { tratamiento: { include: { prestacion: true } } } },
    },
  })
  if (!cobro) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(cobro)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.cobro.findFirst({
    where: { id, clinicaId: u.clinicaId },
    select: { id: true, anulado: true, estado: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const data: Record<string, unknown> = {}

  // Sólo los campos de estado/medio se pueden ajustar libremente.
  // Para modificar otros campos (montos, items, fechaPago) se requiere el permiso puedeEditarPagos.
  const camposLibres = ['estado', 'medioPagoId', 'metodoPago']
  const camposPrivilegiados = ['monto', 'montoNeto', 'comisionMonto', 'concepto', 'notas', 'fechaPago', 'reciboUsuarioId']

  const tocaPrivilegiado = camposPrivilegiados.some(k => body[k] !== undefined)
  if (tocaPrivilegiado) {
    // recargar permiso actualizado por si cambió desde el JWT
    const me = await prisma.user.findUnique({
      where: { id: u.id },
      select: { puedeEditarPagos: true, role: true },
    })
    const allowed = me?.role === 'admin' || me?.puedeEditarPagos
    if (!allowed) {
      return NextResponse.json({ error: 'No tienes permiso para editar pagos.' }, { status: 403 })
    }
    if (existing.anulado) {
      return NextResponse.json({ error: 'Cobro anulado: no se puede editar.' }, { status: 400 })
    }
  }

  if (body.estado !== undefined) {
    if (!ESTADOS.includes(body.estado)) {
      return NextResponse.json({ error: `estado inválido. Use: ${ESTADOS.join(', ')}` }, { status: 400 })
    }
    data.estado = body.estado
  }
  if (body.notas !== undefined) data.notas = body.notas ? String(body.notas) : null
  if (body.fechaPago !== undefined) data.fechaPago = body.fechaPago ? new Date(body.fechaPago) : null
  if (body.medioPagoId !== undefined) {
    if (body.medioPagoId === null) {
      data.medioPagoId = null
    } else {
      const mp = await prisma.medioPago.findFirst({
        where: { id: body.medioPagoId, clinicaId: u.clinicaId },
        select: { id: true },
      })
      if (!mp) return NextResponse.json({ error: 'Medio de pago inválido' }, { status: 400 })
      data.medioPagoId = body.medioPagoId
    }
  }
  if (body.metodoPago !== undefined) data.metodoPago = body.metodoPago ? String(body.metodoPago) : null
  if (body.concepto !== undefined) data.concepto = String(body.concepto)
  if (body.monto !== undefined) {
    const n = Number(body.monto)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'monto inválido' }, { status: 400 })
    data.monto = n
  }
  if (body.montoNeto !== undefined) {
    const n = Number(body.montoNeto)
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'montoNeto inválido' }, { status: 400 })
    data.montoNeto = n
  }
  if (body.comisionMonto !== undefined) {
    const n = Number(body.comisionMonto)
    if (!Number.isFinite(n)) return NextResponse.json({ error: 'comisionMonto inválido' }, { status: 400 })
    data.comisionMonto = n
  }
  if (body.reciboUsuarioId !== undefined) {
    if (body.reciboUsuarioId === null || body.reciboUsuarioId === '') {
      data.reciboUsuarioId = null
    } else {
      // Validar que el usuario receptor exista en la misma clínica.
      const user = await prisma.user.findFirst({
        where: { id: String(body.reciboUsuarioId), clinicaId: u.clinicaId },
        select: { id: true },
      })
      if (!user) {
        return NextResponse.json({ error: 'Usuario receptor inválido' }, { status: 400 })
      }
      data.reciboUsuarioId = user.id
    }
  }

  // updateMany con filtro de clinicaId: defensa en profundidad.
  const r = await prisma.cobro.updateMany({ where: { id, clinicaId: u.clinicaId }, data })
  if (r.count === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const cobro = await prisma.cobro.findUnique({
    where: { id },
    include: {
      paciente: true,
      medioPago: true,
      reciboUsuario: { select: { id: true, name: true, email: true } },
      items: true,
    },
  })
  return NextResponse.json(cobro)
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await prisma.cobro.findFirst({ where: { id, clinicaId: u.clinicaId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Solo admins pueden eliminar cobros físicamente; el resto debe anular.
  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { role: true } })
  if (me?.role !== 'admin') {
    return NextResponse.json({ error: 'Para borrar usa "Anular" con motivo. Solo admin puede eliminar.' }, { status: 403 })
  }
  await prisma.cobro.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
