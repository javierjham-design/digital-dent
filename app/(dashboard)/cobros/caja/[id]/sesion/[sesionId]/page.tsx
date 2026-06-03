export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { SesionDetalleClient } from './sesion-detalle-client'

export default async function SesionDetallePage({
  params,
}: {
  params: Promise<{ id: string; sesionId: string }>
}) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')
  const { id, sesionId } = await params

  const caja = await prisma.caja.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: { usuarios: { select: { userId: true } } },
  })
  if (!caja) notFound()
  if (u.role !== 'admin' && !caja.usuarios.some(cu => cu.userId === u.id)) notFound()

  const sesion = await prisma.sesionCaja.findFirst({
    where: { id: sesionId, cajaId: id, clinicaId: u.clinicaId },
  })
  if (!sesion) notFound()

  const hasta = sesion.cerradaAt ?? new Date()
  const movimientos = await prisma.movimientoCaja.findMany({
    where: {
      cajaId: id,
      OR: [
        { sesionCajaId: sesionId },
        { sesionCajaId: null, fecha: { gte: sesion.abiertaAt, lte: hasta } },
      ],
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      cobro: {
        select: {
          id: true,
          numero: true,
          monto: true,
          montoNeto: true,
          comisionMonto: true,
          anulado: true,
          medioPago: { select: { id: true, nombre: true } },
          paciente: { select: { id: true, nombre: true, apellido: true } },
        },
      },
    },
    orderBy: { fecha: 'desc' },
  })

  return (
    <SesionDetalleClient
      caja={{ id: caja.id, nombre: caja.nombre }}
      sesion={{
        id: sesion.id,
        estado: sesion.estado,
        abiertaAt: sesion.abiertaAt.toISOString(),
        cerradaAt: sesion.cerradaAt?.toISOString() ?? null,
        abiertaPorNombre: sesion.abiertaPorNombre,
        cerradaPorNombre: sesion.cerradaPorNombre,
        saldoApertura: sesion.saldoApertura,
        saldoEsperado: sesion.saldoEsperado,
        saldoReal: sesion.saldoReal,
        diferencia: sesion.diferencia,
        totalIngresos: sesion.totalIngresos,
        totalEgresos: sesion.totalEgresos,
        observaciones: sesion.observaciones,
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
        cobroId: m.cobroId,
        cobroNumero: m.cobro?.numero ?? null,
        cobroBruto: m.cobro?.monto ?? null,
        cobroComision: m.cobro?.comisionMonto ?? null,
        medioPagoNombre: m.cobro?.medioPago?.nombre ?? null,
        pacienteNombre: m.cobro ? `${m.cobro.paciente.nombre} ${m.cobro.paciente.apellido}` : null,
        userNombre: m.user.name ?? m.user.email,
      }))}
    />
  )
}
