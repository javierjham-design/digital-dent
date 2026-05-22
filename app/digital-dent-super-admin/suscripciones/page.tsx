export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { getEstadoPago, precioMensualEfectivo, type EstadoPago } from '@/lib/billing'
import { SuscripcionesClient } from './suscripciones-client'

export default async function SuscripcionesPage() {
  const clinicas = await prisma.clinica.findMany({
    select: {
      id: true,
      slug: true,
      nombre: true,
      plan: true,
      activo: true,
      trialHasta: true,
      proximoCobro: true,
      precioAcordado: true,
      cicloFacturacion: true,
      createdAt: true,
      pagosSuscripcion: {
        orderBy: { fechaPago: 'desc' },
        take: 1,
        select: { fechaPago: true, monto: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const now = new Date()
  const en7dias = new Date(now.getTime() + 7 * 86400000)

  let mrr = 0
  let arr = 0
  const contadores: Record<EstadoPago, number> = { TRIAL: 0, AL_DIA: 0, ATRASADO: 0, SUSPENDIDO: 0 }
  let trialsPorVencer = 0

  const lista = clinicas.map((c) => {
    const estado = getEstadoPago({
      plan: c.plan,
      activo: c.activo,
      trialHasta: c.trialHasta,
      proximoCobro: c.proximoCobro,
      precioAcordado: c.precioAcordado,
      cicloFacturacion: c.cicloFacturacion,
    }, now)
    contadores[estado]++

    const precio = precioMensualEfectivo({ plan: c.plan, precioAcordado: c.precioAcordado })

    if (estado === 'AL_DIA' && c.plan !== 'TRIAL') {
      mrr += precio
      arr += precio * 12
    }
    if (estado === 'TRIAL' && c.trialHasta && c.trialHasta.getTime() <= en7dias.getTime()) {
      trialsPorVencer++
    }

    return {
      id: c.id,
      slug: c.slug,
      nombre: c.nombre,
      plan: c.plan,
      activo: c.activo,
      trialHasta: c.trialHasta?.toISOString() ?? null,
      proximoCobro: c.proximoCobro?.toISOString() ?? null,
      precioAcordado: c.precioAcordado,
      precioMensual: precio,
      cicloFacturacion: c.cicloFacturacion,
      estado,
      ultimoPago: c.pagosSuscripcion[0]
        ? { fecha: c.pagosSuscripcion[0].fechaPago.toISOString(), monto: c.pagosSuscripcion[0].monto }
        : null,
      createdAt: c.createdAt.toISOString(),
    }
  })

  return (
    <SuscripcionesClient
      kpis={{
        totalClinicas: clinicas.length,
        mrr,
        arr,
        alDia: contadores.AL_DIA,
        atrasadas: contadores.ATRASADO,
        enTrial: contadores.TRIAL,
        suspendidas: contadores.SUSPENDIDO,
        trialsPorVencer,
      }}
      clinicas={lista}
    />
  )
}
