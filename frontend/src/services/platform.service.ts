// Servicios PÚBLICOS de la plataforma (sin sesión): catálogo de planes para las
// landings y creación de demo self-service. No usan el cliente `api` (que
// redirige a /login en 401) porque son endpoints abiertos.

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

async function pub<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`)
  return data as T
}

export interface PlanPublico {
  id: string; nombre: string; descripcion: string | null
  precioMensual: number; precioMensualUSD: number; precioAnual: number | null
  maxProfesionales: number; caracteristicas: string[]; destacado: boolean; orden: number
}

export interface DemoInput {
  nombre: string; email: string; telefono?: string; nombreClinica: string
  pais?: string; tracking?: Record<string, string | undefined>
}
export interface DemoResult { token: string; slug: string; loginUrl: string; usuario: string; password: string; expiraEn: string }

export const platformService = {
  planes: () => pub<{ planes: PlanPublico[] }>('GET', '/planes'),
  crearDemo: (input: DemoInput) => pub<DemoResult>('POST', '/demo', input),
}
