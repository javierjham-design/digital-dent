import type { Request, Response } from 'express'
import { getPlanes } from '@/lib/plans'

// Catálogo PÚBLICO de planes para la landing (sin auth). Solo planes activos,
// con los campos que necesita el sitio de marketing.
export async function getPlanesPublicos(_req: Request, res: Response) {
  const planes = await getPlanes({ soloActivos: true })
  res.json({
    planes: planes.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion,
      precioMensual: p.precioMensual,
      precioAnual: p.precioAnual,
      caracteristicas: p.caracteristicas,
      destacado: p.destacado,
      orden: p.orden,
    })),
  })
}
