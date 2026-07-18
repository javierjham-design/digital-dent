// Cliente del sitio web hacia la API pública del backend (planes + demo) y
// helpers para construir URLs de la plataforma (subdominios de clínica).

const API_BASE = String(import.meta.env.VITE_API_URL ?? '/api/v1')
const PLATFORM_DOMAIN = String(import.meta.env.VITE_PLATFORM_DOMAIN ?? '').trim()
// Subdominio donde vive la SPA en modo "manual" (login escribiendo el código).
const APP_SUBDOMAIN = 'app'

export interface PlanLanding {
  id: string
  nombre: string
  descripcion: string | null
  precioMensual: number      // CLP
  precioMensualUSD: number   // USD (mercados fuera de Chile)
  precioAnual: number | null
  caracteristicas: string[]
  destacado: boolean
}

// Planes públicos (conectados al catálogo del super-admin vía backend /planes).
// Devuelve ambos precios (CLP y USD); la landing usa el que corresponda.
export async function fetchPlanes(): Promise<PlanLanding[]> {
  const res = await fetch(`${API_BASE}/planes`)
  if (!res.ok) throw new Error(`Error ${res.status}`)
  const data = (await res.json()) as { planes: PlanLanding[] }
  return (data.planes ?? []).filter((p) => p.precioMensual > 0).sort((a, b) => a.precioMensual - b.precioMensual)
}

// Captura UTM/atribución de la URL para saber de qué campaña vino el lead.
export function capturarTracking(): Record<string, string> {
  const p = new URLSearchParams(window.location.search)
  const map: Record<string, string> = {}
  const campos: Record<string, string> = {
    utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign',
    utm_content: 'utmContent', utm_term: 'utmTerm',
  }
  for (const [k, v] of Object.entries(campos)) { const val = p.get(k); if (val) map[v] = val }
  map.landing = window.location.href
  return map
}

export interface DemoInput {
  nombre: string; email: string; telefono?: string; nombreClinica: string; vertical: string
  pais?: string; tracking?: Record<string, string>
}
export interface DemoResult { token: string; slug: string; usuario: string; password: string; loginUrl: string; expiraEn: string }

export async function crearDemo(input: DemoInput): Promise<DemoResult> {
  const res = await fetch(`${API_BASE}/demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'No se pudo crear la demo.')
  return data as DemoResult
}

// URL del login de la plataforma (SPA en modo manual). En dev cae a localhost.
export function appLoginUrl(): string {
  if (PLATFORM_DOMAIN) return `https://${APP_SUBDOMAIN}.${PLATFORM_DOMAIN}`
  return 'http://localhost:5173'
}

// URL de la clínica por subdominio, con handoff opcional de sesión por #token.
// Devuelve null si no hay dominio configurado (dev) → se muestran credenciales.
export function clinicaUrl(slug: string, token?: string): string | null {
  if (!PLATFORM_DOMAIN) return null
  const base = `https://${slug}.${PLATFORM_DOMAIN}/agenda`
  return token ? `${base}#token=${encodeURIComponent(token)}` : base
}
