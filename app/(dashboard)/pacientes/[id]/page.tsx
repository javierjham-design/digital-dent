export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { notFound, redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { FichaClinicaClient } from './ficha-client'

export default async function FichaPacientePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const { id } = await params
  const paciente = await prisma.paciente.findFirst({
    where: { id, clinicaId: u.clinicaId },
    include: {
      fichaClinica: {
        include: {
          tratamientos: { include: { prestacion: true, doctor: { select: { id: true, name: true, email: true } } } },
          odontograma: true,
        },
      },
      citas: {
        include: { doctor: { select: { id: true, name: true, email: true } } },
        orderBy: { fecha: 'desc' },
        take: 20,
      },
      cobros: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          items: true,
          medioPago: { select: { id: true, nombre: true, comision: true } },
          reciboUsuario: { select: { id: true, name: true, email: true } },
        },
      },
      presupuestos: {
        include: { items: { include: { prestacion: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      comentariosAdmin: { orderBy: { createdAt: 'desc' } },
      mensajes: { orderBy: { createdAt: 'desc' }, take: 100 },
    },
  })

  if (!paciente) notFound()

  const doctors = await prisma.user.findMany({
    where: { clinicaId: u.clinicaId, role: { in: ['admin', 'doctor', 'medico'] } },
    select: { id: true, name: true, email: true },
  })
  const prestaciones = await prisma.prestacion.findMany({
    where: { clinicaId: u.clinicaId, activo: true },
    orderBy: { nombre: 'asc' },
  })

  // Datos extra para registrar pagos directo desde la ficha
  const canReceivePayments = u.role === 'admin' || (await prisma.user.findUnique({
    where: { id: u.id }, select: { puedeRecibirPagos: true },
  }))?.puedeRecibirPagos === true

  const [mediosPago, cajasAccesibles, cajeros, tratamientosPendientes] = await Promise.all([
    prisma.medioPago.findMany({
      where: { clinicaId: u.clinicaId, activo: true },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, comision: true },
    }),
    prisma.caja.findMany({
      where: u.role === 'admin'
        ? { clinicaId: u.clinicaId, activo: true }
        : { clinicaId: u.clinicaId, activo: true, usuarios: { some: { userId: u.id } } },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true },
    }),
    prisma.user.findMany({
      where: { clinicaId: u.clinicaId, activo: true, puedeRecibirPagos: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    }),
    prisma.tratamiento.findMany({
      where: {
        clinicaId: u.clinicaId,
        ficha: { pacienteId: id },
        estado: 'COMPLETADO',
        cobroItems: { none: { cobro: { anulado: false } } },
      },
      include: { prestacion: { select: { nombre: true } } },
      orderBy: { fechaCompletado: 'desc' },
    }),
  ])

  return (
    <FichaClinicaClient
      paciente={{
        ...paciente,
        fechaNacimiento: paciente.fechaNacimiento?.toISOString() ?? null,
        createdAt: paciente.createdAt.toISOString(),
        updatedAt: paciente.updatedAt.toISOString(),
        fichaClinica: paciente.fichaClinica ? {
          ...paciente.fichaClinica,
          createdAt: paciente.fichaClinica.createdAt.toISOString(),
          updatedAt: paciente.fichaClinica.updatedAt.toISOString(),
          tratamientos: paciente.fichaClinica.tratamientos.map((t) => ({
            ...t,
            fecha: t.fecha.toISOString(),
            fechaCompletado: t.fechaCompletado?.toISOString() ?? null,
          })),
        } : null,
        citas: paciente.citas.map((c) => ({ ...c, fecha: c.fecha.toISOString(), createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
        cobros: paciente.cobros.map((c) => ({ ...c, fechaPago: c.fechaPago?.toISOString() ?? null, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() })),
        presupuestos: paciente.presupuestos.map((p) => ({ ...p, vigencia: p.vigencia?.toISOString() ?? null, createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString() })),
        comentariosAdmin: paciente.comentariosAdmin.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
        mensajes: paciente.mensajes.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      }}
      doctors={doctors}
      prestaciones={prestaciones}
      currentUserId={u.id}
      permisos={{
        puedeModificarPrecio: u.puedeModificarPrecio,
        puedeAplicarDescuento: u.puedeAplicarDescuento,
        puedeRevertirCompletado: u.puedeRevertirCompletado,
        puedeRecibirPagos: canReceivePayments,
        puedeEditarPagos: u.puedeEditarPagos,
      }}
      pagosData={{
        mediosPago,
        cajas: cajasAccesibles,
        cajeros: cajeros.map(c => ({ id: c.id, nombre: c.name ?? c.email })),
        tratamientosPendientes: tratamientosPendientes.map(t => ({
          id: t.id,
          descripcion: t.prestacion.nombre,
          monto: t.precio,
          diente: t.diente,
          fechaCompletado: t.fechaCompletado?.toISOString() ?? null,
        })),
      }}
    />
  )
}
