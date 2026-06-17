// Resolución de la clínica por SUBDOMINIO, replicando el comportamiento del
// monolito (proxy.ts): <slug>.clariva.cl = clínica, super-admin.clariva.cl =
// plataforma, clariva.cl / www = landing (no la sirve esta SPA), y un conjunto
// de subdominios reservados. La tenancy real vive en el JWT; el subdominio solo
// decide con qué slug se loguea la SPA.
//
// El dominio base se inyecta en build con VITE_PLATFORM_DOMAIN (p.ej. "clariva.cl").
// En dev (localhost, sin VITE_PLATFORM_DOMAIN) el modo es "manual": el usuario
// escribe el código de clínica a mano (mismo fallback que /c/<slug> del monolito).

const PLATFORM_DOMAIN = String(import.meta.env.VITE_PLATFORM_DOMAIN ?? '').toLowerCase().trim()

// Idéntico a RESERVED_SUBDOMAINS del monolito.
const RESERVED = new Set(['super-admin', 'www', 'admin', 'api', 'app', 'mail'])

export type TenantModo = 'clinica' | 'plataforma' | 'manual'
export interface TenantContext {
  modo: TenantModo
  /** slug de la clínica cuando modo === 'clinica' */
  slug: string | null
}

export function extractSubdomain(host: string): string | null {
  if (!PLATFORM_DOMAIN) return null
  const h = host.split(':')[0].toLowerCase()
  if (h === PLATFORM_DOMAIN) return null
  if (!h.endsWith(`.${PLATFORM_DOMAIN}`)) return null
  const sub = h.slice(0, h.length - PLATFORM_DOMAIN.length - 1)
  if (sub.includes('.')) return null // no aceptamos sub-sub-dominios
  return sub
}

export function getTenantContext(host: string = window.location.hostname): TenantContext {
  const sub = extractSubdomain(host)
  if (sub === 'super-admin') return { modo: 'plataforma', slug: null }
  if (sub && !RESERVED.has(sub)) return { modo: 'clinica', slug: sub }
  // apex, www, reservado, localhost o sin dominio configurado → entrada manual.
  return { modo: 'manual', slug: null }
}
