import type { VerticalId } from '@/lib/verticales'

// Registro de landing pages de campaña. Cada entrada se publica en /<slug>
// (ej: clariva.cl/landing-1). Para crear una nueva landing basta con agregar
// un objeto a este arreglo — el router y la plantilla hacen el resto.
export interface Campaign {
  slug: string          // ruta pública: /<slug>
  vertical: VerticalId  // rubro que usa la demo
  badge?: string
  titulo: string        // texto antes de la palabra resaltada
  destacado: string     // palabra/frase resaltada
  subtitulo: string
  bullets: string[]
  ctaTexto?: string
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
]

export function getCampaign(slug: string): Campaign | undefined {
  return CAMPAIGNS.find((c) => c.slug === slug)
}
