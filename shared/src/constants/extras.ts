// Catálogo de EXTRAS facturables predefinidos (cargos mensuales sobre el plan).
// Se guardan como ExtraSuscripcion (control-plane) y se suman al MRR igual que
// cualquier extra. El módulo de área es un extra sobre el plan base: el área con
// la que nace la clínica (su vertical) va incluida en el plan; las áreas
// adicionales (estética, médico) se cobran como extra.
//
// El `montoMensual` es SUGERIDO: el Super Admin lo puede ajustar por clínica al
// agregar el extra. Precios en CLP (Chile) y USD (resto), como el resto del cobro.
import type { MonedaCobro } from './cobro'

export interface ExtraCatalogoDef {
  codigo: string
  nombre: string
  descripcion: string
  montoMensual: number      // CLP sugerido
  montoMensualUSD: number   // USD sugerido
}

export const EXTRAS_CATALOGO: ExtraCatalogoDef[] = [
  {
    codigo: 'AREA_ESTETICA',
    nombre: 'Módulo Estética facial',
    descripcion: 'Mapa de zonas faciales + catálogo y fichas del área estética.',
    montoMensual: 14900,
    montoMensualUSD: 18,
  },
  {
    codigo: 'AREA_MEDICO',
    nombre: 'Módulo Médico',
    descripcion: 'Catálogo y fichas del área médica.',
    montoMensual: 14900,
    montoMensualUSD: 18,
  },
]

export function precioExtraCatalogo(e: ExtraCatalogoDef, moneda: MonedaCobro): number {
  return moneda === 'USD' ? e.montoMensualUSD : e.montoMensual
}
