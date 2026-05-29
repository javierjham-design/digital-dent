export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { CobrosClient } from './cobros-client'

export default async function CobrosPage() {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const canEditPayments = u.role === 'admin' || u.puedeEditarPagos
  const canReceivePayments = u.role === 'admin' || (await prisma.user.findUnique({
    where: { id: u.id }, select: { puedeRecibirPagos: true },
  }))?.puedeRecibirPagos === true

  const [cobros, pacientes, mediosPago, cajeros, tratamientos, cajas] = await Promise.all([
    prisma.cobro.findMany({
      where: { clinicaId: u.clinicaId },
      include: {
        paciente: true,
        medioPago: true,
        reciboUsuario: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            tratamiento: { include: { prestacion: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.paciente.findMany({
      where: { clinicaId: u.clinicaId, activo: true },
      select: { id: true, nombre: true, apellido: true, rut: true },
      orderBy: { apellido: 'asc' },
    }),
    prisma.medioPago.findMany({
      where: { clinicaId: u.clinicaId, activo: true },
      orderBy: { nombre: 'asc' },
    }),
    prisma.user.findMany({
      where: { clinicaId: u.clinicaId, puedeRecibirPagos: true, activo: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.tratamiento.findMany({
      where: {
        clinicaId: u.clinicaId,
        estado: 'COMPLETADO',
        // Si todos los cobros que lo contienen están anulados, vuelve a estar disponible
        cobroItems: { none: { cobro: { anulado: false } } },
      },
      include: {
        ficha: { include: { paciente: { select: { id: true, nombre: true, apellido: true } } } },
        prestacion: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCompletado: 'desc' },
    }),
    prisma.caja.findMany({
      where: u.role === 'admin'
        ? { clinicaId: u.clinicaId, activo: true }
        : { clinicaId: u.clinicaId, activo: true, usuarios: { some: { userId: u.id } } },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    }),
  ])

  return (
    <CobrosClient
      canEditPayments={canEditPayments}
      canReceivePayments={canReceivePayments}
      cajas={cajas}
      cobros={cobros.map((c) => ({
        id:          c.id,
        numero:      c.numero,
        concepto:    c.concepto,
        monto:       c.monto,
        montoNeto:   c.montoNeto,
        comisionMonto: c.comisionMonto,
        estado:      c.estado,
        anulado:     c.anulado,
        motivoAnulacion:   c.motivoAnulacion,
        anuladoAt:         c.anuladoAt?.toISOString() ?? null,
        anuladoPorNombre:  c.anuladoPorNombre,
        notas:       c.notas,
        medioPago:   c.medioPago ? { id: c.medioPago.id, nombre: c.medioPago.nombre, comision: c.medioPago.comision } : null,
        reciboUsuario: c.reciboUsuario ? { id: c.reciboUsuario.id, nombre: c.reciboUsuario.name ?? c.reciboUsuario.email } : null,
        fechaPago:   c.fechaPago?.toISOString() ?? null,
        pacienteId:  c.pacienteId,
        paciente:    `${c.paciente.nombre} ${c.paciente.apellido}`,
        createdAt:   c.createdAt.toISOString(),
        items:       c.items.map((i) => ({
          id:          i.id,
          descripcion: i.descripcion,
          monto:       i.monto,
          tratamientoId: i.tratamientoId,
        })),
      }))}
      pacientes={pacientes}
      mediosPago={mediosPago}
      cajeros={cajeros.map((u) => ({ id: u.id, nombre: u.name ?? u.email }))}
      tratamientos={tratamientos.map((t) => ({
        id:          t.id,
        descripcion: t.prestacion.nombre,
        monto:       t.precio,
        pacienteId:  t.ficha.paciente.id,
        paciente:    `${t.ficha.paciente.nombre} ${t.ficha.paciente.apellido}`,
        diente:      t.diente,
        fechaCompletado: t.fechaCompletado?.toISOString() ?? null,
      }))}
    />
  )
}
