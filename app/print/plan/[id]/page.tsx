export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PrintPlanClient } from './print-plan-client'

export default async function PrintPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const plan = await prisma.planTratamiento.findUnique({
    where: { id },
    include: {
      clinica: true,
      doctorTitular: { select: { id: true, name: true, email: true, rut: true } },
      paciente: {
        select: {
          id: true, rut: true, nombre: true, apellido: true, fechaNacimiento: true,
          prevision: true, email: true,
        },
      },
      secciones: {
        orderBy: { orden: 'asc' },
        include: {
          tratamientos: {
            orderBy: { fecha: 'asc' },
            include: {
              prestacion: { select: { nombre: true } },
              doctor: { select: { name: true } },
              cobroItems: {
                select: { cobro: { select: { estado: true } } },
              },
            },
          },
        },
      },
      tratamientos: {
        where: { seccionId: null },
        orderBy: { fecha: 'asc' },
        include: {
          prestacion: { select: { nombre: true } },
          doctor: { select: { name: true } },
          cobroItems: {
            select: { cobro: { select: { estado: true } } },
          },
        },
      },
    },
  })

  if (!plan) notFound()

  // Sumar pagos del paciente que corresponden a items vinculados a tratamientos
  // de este plan. Lo aproximamos: total pagado en cobros PAGADOS asociados a
  // tratamientos de este plan.
  const todosTratamientoIds = [
    ...plan.tratamientos.map((t) => t.id),
    ...plan.secciones.flatMap((s) => s.tratamientos.map((t) => t.id)),
  ]
  const cobroItems = todosTratamientoIds.length
    ? await prisma.cobroItem.findMany({
        where: { tratamientoId: { in: todosTratamientoIds } },
        include: { cobro: { select: { estado: true } } },
      })
    : []
  const totalPagado = cobroItems
    .filter((ci) => ci.cobro.estado === 'PAGADO')
    .reduce((s, ci) => s + ci.monto, 0)

  const data = {
    clinica: {
      nombre: plan.clinica?.nombre ?? 'Clínica',
      direccion: plan.clinica?.direccion ?? '',
      ciudad: plan.clinica?.ciudad ?? '',
      telefono: plan.clinica?.telefono ?? '',
      email: plan.clinica?.email ?? '',
      logoUrl: plan.clinica?.logoUrl ?? null,
    },
    plan: {
      id: plan.id,
      numero: plan.id.slice(0, 4).toUpperCase(),
      nombre: plan.nombre,
      createdAt: plan.createdAt.toISOString(),
    },
    doctor: plan.doctorTitular ? {
      name: plan.doctorTitular.name ?? 'Sin nombre',
      rut: plan.doctorTitular.rut ?? '',
    } : null,
    paciente: {
      nombre: `${plan.paciente.nombre} ${plan.paciente.apellido}`,
      rut: plan.paciente.rut ?? '',
      fechaNacimiento: plan.paciente.fechaNacimiento?.toISOString() ?? null,
      prevision: plan.paciente.prevision ?? '',
      email: plan.paciente.email ?? '',
    },
    secciones: plan.secciones.map((s, idx) => ({
      titulo: `${idx + 1}- ${s.titulo}`,
      tratamientos: s.tratamientos.map(serializeTratamiento),
    })),
    sinSeccion: plan.tratamientos.map(serializeTratamiento),
    totalPagado,
  }

  return <PrintPlanClient data={data} />
}

function serializeTratamiento(t: {
  diente: number | null
  cara: string | null
  precio: number
  descuento: number
  estado: string
  prestacion: { nombre: string }
  cobroItems: { cobro: { estado: string } }[]
}) {
  return {
    prestacion: t.prestacion.nombre,
    pieza: t.diente ? String(t.diente) : t.cara ?? '-',
    precio: t.precio,
    descuento: t.descuento,
    subtotal: t.precio * (1 - (t.descuento || 0) / 100),
    estado: t.estado,
    pagado: t.cobroItems.some((ci) => ci.cobro.estado === 'PAGADO'),
  }
}
