export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import {
  calcularResumenSesion,
  calcularSaldoSugerido,
  diasDesde,
  estadoDeCaja,
  getSesionAbierta,
  getUltimaSesion,
  SESION_STALE_DIAS,
} from '@/lib/caja'
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

  // Estado actual de la caja según su última sesión
  const [sesionAbierta, ultimaSesion, sesionesPrevias, me] = await Promise.all([
    getSesionAbierta(id),
    getUltimaSesion(id),
    prisma.sesionCaja.findMany({
      where: { cajaId: id, estado: 'CERRADA' },
      orderBy: { cerradaAt: 'desc' },
      take: 24,
      select: {
        id: true, abiertaAt: true, cerradaAt: true,
        abiertaPorNombre: true, cerradaPorNombre: true,
        saldoApertura: true, saldoEsperado: true, saldoReal: true, diferencia: true,
        totalIngresos: true, totalEgresos: true,
      },
    }),
    prisma.user.findUnique({ where: { id: u.id }, select: { puedeEditarPagos: true } }),
  ])
  const estado = estadoDeCaja(ultimaSesion)
  const canVoidMovements = isAdmin || me?.puedeEditarPagos === true

  // Si hay sesión abierta, traemos los movimientos de la sesión actual y el resumen.
  const [resumenSesion, movimientosSesion, saldoSugerido] = await Promise.all([
    sesionAbierta ? calcularResumenSesion(sesionAbierta.id) : Promise.resolve(null),
    sesionAbierta
      ? prisma.movimientoCaja.findMany({
          where: {
            cajaId: id,
            OR: [
              { sesionCajaId: sesionAbierta.id },
              { sesionCajaId: null, fecha: { gte: sesionAbierta.abiertaAt } },
            ],
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            cobro: {
              select: {
                id: true, numero: true, anulado: true,
                medioPago: { select: { id: true, nombre: true } },
                paciente: { select: { id: true, nombre: true, apellido: true } },
              },
            },
          },
          orderBy: { fecha: 'desc' },
          take: 500,
        })
      : Promise.resolve([]),
    estado !== 'ABIERTA' ? calcularSaldoSugerido(id) : Promise.resolve(0),
  ])

  const diasAbierta = sesionAbierta ? diasDesde(sesionAbierta.abiertaAt) : 0
  const stale = sesionAbierta != null && diasAbierta >= SESION_STALE_DIAS

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
      estado={estado}
      sesionActual={sesionAbierta ? {
        id: sesionAbierta.id,
        abiertaAt: sesionAbierta.abiertaAt.toISOString(),
        abiertaPorNombre: sesionAbierta.abiertaPorNombre,
        saldoApertura: sesionAbierta.saldoApertura,
        ingresos: resumenSesion?.ingresos ?? 0,
        egresos: resumenSesion?.egresos ?? 0,
        saldoEsperado: resumenSesion?.saldoEsperado ?? sesionAbierta.saldoApertura,
        diasAbierta,
        stale,
      } : null}
      ultimoCierre={
        estado === 'CERRADA' && ultimaSesion
          ? {
              id: ultimaSesion.id,
              abiertaAt: ultimaSesion.abiertaAt.toISOString(),
              cerradaAt: ultimaSesion.cerradaAt?.toISOString() ?? null,
              abiertaPorNombre: ultimaSesion.abiertaPorNombre,
              cerradaPorNombre: ultimaSesion.cerradaPorNombre,
              saldoApertura: ultimaSesion.saldoApertura,
              saldoEsperado: ultimaSesion.saldoEsperado,
              saldoReal: ultimaSesion.saldoReal,
              diferencia: ultimaSesion.diferencia,
              totalIngresos: ultimaSesion.totalIngresos,
              totalEgresos: ultimaSesion.totalEgresos,
            }
          : null
      }
      saldoSugerido={saldoSugerido}
      sesionesPrevias={sesionesPrevias.map(s => ({
        id: s.id,
        abiertaAt: s.abiertaAt.toISOString(),
        cerradaAt: s.cerradaAt?.toISOString() ?? null,
        abiertaPorNombre: s.abiertaPorNombre,
        cerradaPorNombre: s.cerradaPorNombre,
        saldoApertura: s.saldoApertura,
        saldoEsperado: s.saldoEsperado,
        saldoReal: s.saldoReal,
        diferencia: s.diferencia,
        totalIngresos: s.totalIngresos,
        totalEgresos: s.totalEgresos,
      }))}
      movimientos={movimientosSesion.map(m => ({
        id: m.id,
        tipo: m.tipo,
        monto: m.monto,
        descripcion: m.descripcion,
        categoria: m.categoria,
        fecha: m.fecha.toISOString(),
        sesionCajaId: m.sesionCajaId,
        anulado: m.anulado,
        motivoAnulacion: m.motivoAnulacion,
        anuladoAt: m.anuladoAt?.toISOString() ?? null,
        anuladoPorNombre: m.anuladoPorNombre,
        cobroId: m.cobroId,
        cobroNumero: m.cobro?.numero ?? null,
        medioPagoNombre: m.cobro?.medioPago?.nombre ?? null,
        pacienteNombre: m.cobro ? `${m.cobro.paciente.nombre} ${m.cobro.paciente.apellido}` : null,
        userNombre: m.user.name ?? m.user.email,
      }))}
      canVoidMovements={canVoidMovements}
      staleDias={SESION_STALE_DIAS}
    />
  )
}
