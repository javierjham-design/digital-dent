export const dynamic = 'force-dynamic'

import { getPlanes } from '@/lib/plans'
import { LandingClient } from './landing-client'

export default async function HomePage() {
  const planes = await getPlanes({ soloActivos: true })

  // Planes pagados ordenados por precio. El "desde" del hero usa el menor.
  const pagados = planes
    .filter((p) => p.precioMensual > 0)
    .sort((a, b) => a.precioMensual - b.precioMensual)

  const desde = pagados[0]?.precioMensual ?? 39900

  return (
    <LandingClient
      desde={desde}
      planes={pagados.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioMensual: p.precioMensual,
        precioAnual: p.precioAnual,
        caracteristicas: p.caracteristicas,
        destacado: p.destacado,
      }))}
    />
  )
}
