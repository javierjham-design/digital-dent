export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { CajaDetalleClient } from './caja-detalle-client'

export default async function CajaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')
  const { id } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  })
  if (!caja) notFound()

  // Acceso: admin o asignado a la caja
  const isAdmin = u.role === 'admin'
  const isMiembro = caja.usuarios.some(cu => cu.userId === u.id)
  if (!isAdmin && !isMiembro) notFound()

  // Cargar todos los movimientos (no anulados o anulados) — el cliente filtra por período en memoria
  const movimientos = await prisma.movimientoCaja.findMany({
    where: { cajaId: id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: {
        select: {
          id: true, numero: true, anulado: true,
          paciente: { select: { id: true, nombre: true, apellido: true } },
        },
      },
    },
    orderBy: { fecha: 'desc' },
    take: 500,
  })

  // Permiso para anular movimientos manuales
  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { puedeEditarPagos: true } })
  const canVoidMovements = isAdmin || me?.puedeEditarPagos === true

  return (
    <CajaDetalleClient
      caja={{
        id: caja.id,
        nombre: caja.nombre,
        descripcion: caja.descripcion,
        saldoInicial: caja.saldoInicial,
        activo: caja.activo,
        usuarios: caja.usuarios.map(cu => ({ id: cu.user.id, nombre: cu.user.name ?? cu.user.email })),
      }}
      movimientos={movimientos.map(m => ({
        id: m.id,
        tipo: m.tipo,
        monto: m.monto,
        descripcion: m.descripcion,
        categoria: m.categoria,
        fecha: m.fecha.toISOString(),
        anulado: m.anulado,
        motivoAnulacion: m.motivoAnulacion,
        anuladoAt: m.anuladoAt?.toISOString() ?? null,
        anuladoPorNombre: m.anuladoPorNombre,
        cobroId: m.cobroId,
        cobroNumero: m.cobro?.numero ?? null,
        pacienteNombre: m.cobro ? `${m.cobro.paciente.nombre} ${m.cobro.paciente.apellido}` : null,
        userNombre: m.user.name ?? m.user.email,
      }))}
      canVoidMovements={canVoidMovements}
    />
  )
}
