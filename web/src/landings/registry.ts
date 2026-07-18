import type { VerticalId } from '@/lib/verticales'

// Registro de landing pages de campaña. Cada entrada se publica en /<slug>
// (ej: clariva.cl/landing-1). Para crear una nueva landing basta con agregar
// un objeto a este arreglo — el router y la plantilla hacen el resto.
export interface Campaign {
  slug: string          // ruta pública: /<slug>
  vertical: VerticalId  // rubro que usa la demo
  moneda?: 'USD' | 'CLP'// moneda de los precios que se muestran (default CLP)
  pais?: string         // código de país para atribución del lead (CR/PA/CO)
  ciudades?: string     // ciudades de ejemplo para el copy
  badge?: string
  titulo: string        // texto antes de la palabra resaltada
  destacado: string     // palabra/frase resaltada
  subtitulo: string
  bullets: string[]
  ctaTexto?: string
}

// Bullets comunes para las campañas internacionales (precios en USD).
const BULLETS_INTL = [
  'Agenda, fichas con odontograma y cobros en un solo lugar',
  'Menos inasistencias con recordatorios por WhatsApp',
  'Presupuestos, cobros y liquidaciones integrados',
  'Precios en dólares · sin instalar nada · sin permanencia',
]

// Crea una campaña internacional (precios en USD) para un país.
function campanaPais(slug: string, pais: string, paisNombre: string, bandera: string, ciudades: string): Campaign {
  return {
    slug, vertical: 'dental', moneda: 'USD', pais, ciudades,
    badge: `${bandera} Clínicas dentales en ${paisNombre}`,
    titulo: `Tu clínica dental en ${paisNombre}, `,
    destacado: 'ordenada y sin inasistencias',
    subtitulo: `Agenda, fichas con odontograma, presupuestos y cobros en una sola plataforma, con confirmaciones por WhatsApp. Precios en dólares, sin permanencia. Pruébala gratis con datos de ejemplo.`,
    bullets: BULLETS_INTL,
    ctaTexto: 'Probar la demo gratis',
  }
}

export const CAMPAIGNS: Campaign[] = [
  {
    slug: 'landing-1',
    vertical: 'dental',
    badge: 'Campaña · Clínicas dentales',
    titulo: 'Tu clínica dental, ',
    destacado: 'ordenada y sin inasistencias',
    subtitulo: 'Agenda, fichas con odontograma, presupuestos y cobros en una sola plataforma, con confirmaciones automáticas por WhatsApp. Pruébala gratis con datos de ejemplo.',
    bullets: [
      'Menos inasistencias con recordatorios por WhatsApp',
      'Ficha clínica y odontograma interactivo',
      'Presupuestos, cobros y liquidaciones integrados',
      'Sin instalar nada · sin permanencia',
    ],
    ctaTexto: 'Probar la demo gratis',
  },
  // Campañas internacionales en USD (clariva.cl/costa-rica, /panama, /colombia).
  campanaPais('costa-rica', 'CR', 'Costa Rica', '🇨🇷', 'San José, Heredia y Cartago'),
  campanaPais('panama', 'PA', 'Panamá', '🇵🇦', 'Ciudad de Panamá, David y Colón'),
  campanaPais('colombia', 'CO', 'Colombia', '🇨🇴', 'Bogotá, Medellín y Cali'),
]

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug)
}
