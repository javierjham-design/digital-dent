export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { diasDesde, SESION_STALE_DIAS } from '@/lib/caja'
import { CajaListClient } from './caja-list-client'

export default async function CajaPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const isAdmin = u.role === 'admin'

  const [cajas, usuarios] = await Promise.all([
    prisma.caja.findMany({
      where: isAdmin
        ? { clinicaId: u.clinicaId }
        : { clinicaId: u.clinicaId, activo: true, usuarios: { some: { userId: u.id } } },
      include: {
        usuarios: { include: { user: { select: { id: true, name: true, email: true } } } },
        movimientos: { where: { anulado: false }, select: { tipo: true, monto: true } },
        // Última sesión, sea abierta o cerrada — define el estado de la caja.
        sesiones: {
          orderBy: { abiertaAt: 'desc' },
          take: 1,
          select: {
            id: true,
            estado: true,
            abiertaAt: true,
            abiertaPorNombre: true,
            cerradaAt: true,
            cerradaPorNombre: true,
            saldoApertura: true,
            saldoReal: true,
            diferencia: true,
            totalIngresos: true,
            totalEgresos: true,
          },
        },
      },
      orderBy: { nombre: 'asc' },
    }),
    isAdmin
      ? prisma.user.findMany({
          where: { clinicaId: u.clinicaId, activo: true, puedeRecibirPagos: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true },
        })
      : Promise.resolve([]),
  ])

  const data = cajas.map(c => {
    const ingresos = c.movimientos.filter(m => m.tipo === 'INGRESO').reduce((s, m) => s + m.monto, 0)
    const egresos  = c.movimientos.filter(m => m.tipo === 'EGRESO').reduce((s, m) => s + m.monto, 0)
    const saldo = c.saldoInicial + ingresos - egresos
    const ultima = c.sesiones[0] ?? null
    const estado: 'ABIERTA' | 'CERRADA' | 'SIN_SESION' =
      !ultima ? 'SIN_SESION' : (ultima.estado === 'ABIERTA' ? 'ABIERTA' : 'CERRADA')
    const diasDesdeEvento = ultima
      ? (estado === 'ABIERTA' ? diasDesde(ultima.abiertaAt) : (ultima.cerradaAt ? diasDesde(ultima.cerradaAt) : null))
      : null
    return {
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      saldoInicial: c.saldoInicial,
      activo: c.activo,
      ingresos, egresos, saldo,
      usuarios: c.usuarios.map(cu => ({ id: cu.user.id, nombre: cu.user.name ?? cu.user.email })),
      estado,
      ultimaSesion: ultima ? {
        id: ultima.id,
        estado: ultima.estado,
        abiertaAt: ultima.abiertaAt.toISOString(),
        cerradaAt: ultima.cerradaAt?.toISOString() ?? null,
        abiertaPorNombre: ultima.abiertaPorNombre,
        cerradaPorNombre: ultima.cerradaPorNombre,
        saldoApertura: ultima.saldoApertura,
        saldoReal: ultima.saldoReal,
        diferencia: ultima.diferencia,
        totalIngresos: ultima.totalIngresos,
        totalEgresos: ultima.totalEgresos,
      } : null,
      diasDesdeEvento,
      stale: estado === 'ABIERTA' && diasDesdeEvento != null && diasDesdeEvento >= SESION_STALE_DIAS,
    }
  })

  return (
    <CajaListClient
      cajas={data}
      isAdmin={isAdmin}
      usuariosDisponibles={usuarios.map(u => ({ id: u.id, nombre: u.name ?? u.email }))}
      staleDias={SESION_STALE_DIAS}
    />
  )
}
