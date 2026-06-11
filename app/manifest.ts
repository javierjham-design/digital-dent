import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cláriva — Gestión dental',
    short_name: 'Cláriva',
    description:
      'Agenda, fichas, presupuestos, cobros y liquidaciones para tu clínica dental.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: '#0e7490',
    lang: 'es-CL',
    dir: 'ltr',
    categories: ['business', 'medical', 'productivity'],
    icons: [
      { src: '/icons/192',           sizes: '192x192', type: 'image/png', purpose: 'any'      },
      { src: '/icons/512',           sizes: '512x512', type: 'image/png', purpose: 'any'      },
      { src: '/icons/maskable-192',  sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512',  sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
