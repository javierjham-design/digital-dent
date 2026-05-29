export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
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
    return {
      id: c.id,
      nombre: c.nombre,
      descripcion: c.descripcion,
      saldoInicial: c.saldoInicial,
      activo: c.activo,
      ingresos, egresos, saldo,
      usuarios: c.usuarios.map(cu => ({ id: cu.user.id, nombre: cu.user.name ?? cu.user.email })),
    }
  })

  return (
    <CajaListClient
      cajas={data}
      isAdmin={isAdmin}
      usuariosDisponibles={usuarios.map(u => ({ id: u.id, nombre: u.name ?? u.email }))}
    />
  )
}
