import { api } from './api'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export interface LeadNota { id: string; tipo: string; texto: string; autorNombre: string | null; createdAt: string }
export interface Lead {
  id: string; nombre: string; apellido: string | null; telefono: string | null; email: string | null; rut: string | null
  motivo: string | null; tratamiento: string | null; piezasReemplazar: string | null; tiempoDesdePerdida: string | null
  estado: string; origen: string; campana: string | null; externalId: string | null
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; utmTerm: string | null
  fbclid: string | null; ctwaClid: string | null; gclid: string | null; msclkid: string | null; ttclid: string | null
  twclid: string | null; liFatId: string | null; igclid: string | null; dclid: string | null; fbp: string | null; fbc: string | null
  referrer: string | null; landing: string | null; tituloPagina: string | null; pantalla: string | null; locale: string | null
  primeraVisita: string | null; ultimaVisita: string | null; fechaAgenda: string | null; agendaFuente: string | null; asistio: boolean | null
  metaEventId: string | null; metaEnviado: boolean; scheduleEventId: string | null; scheduleCapiEnviado: boolean
  pacienteId: string | null; citaId: string | null; responsableId: string | null; createdAt: string
  notas?: LeadNota[]
}
export interface CrmResumen { total: number; estados: Record<string, number>; origenes: { origen: string; n: number }[] }
export interface CrmConfig { slug: string; metaEnabled: boolean; metaPixelId: string | null; hasCapiToken: boolean; capiTokenLen: number; capiTokenLast4: string | null; metaTestCode: string | null; crmToken: string }
export interface MetaTestResult { ok: boolean; status: number; recibidos?: number; testCode?: string; error?: string }

function qs(p?: Record<string, string | undefined>): string {
  if (!p) return ''
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v)
  const s = u.toString()
  return s ? `?${s}` : ''
}

export const crmService = {
  leads: (p?: Record<string, string | undefined>) => api.get<Lead[]>(`/crm/leads${qs(p)}`),
  resumen: () => api.get<CrmResumen>('/crm/resumen'),
  lead: (id: string) => api.get<Lead>(`/crm/leads/${id}`),
  crear: (input: Record<string, unknown>) => api.post<Lead>('/crm/leads', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<Lead>(`/crm/leads/${id}`, patch),
  nota: (id: string, texto: string) => api.post<LeadNota>(`/crm/leads/${id}/notas`, { texto }),
  convertir: (id: string) => api.post<{ pacienteId: string; yaExistia: boolean }>(`/crm/leads/${id}/convertir`, {}),
  agendar: (id: string, body: { doctorId: string; fecha: string; duracion?: number; tipo?: string; notas?: string; sobrecupo?: boolean }) =>
    api.post<{ pacienteId: string; citaId: string; inicio: string }>(`/crm/leads/${id}/agendar`, body),
  eliminar: (id: string) => api.del<{ ok: true }>(`/crm/leads/${id}`),
  config: () => api.get<CrmConfig>('/crm/config'),
  guardarConfig: (patch: Record<string, unknown>) => api.patch<CrmConfig>('/crm/config', patch),
  probarMeta: () => api.post<MetaTestResult>('/crm/meta/test', {}),
  apiKeyEstado: () => api.get<{ hasApiKey: boolean }>('/crm/api-key'),
  rotarApiKey: () => api.post<{ apiKey: string }>('/crm/api-key/rotate', {}),
  revocarApiKey: () => api.del<{ ok: true }>('/crm/api-key'),
}

// ── Público: formulario hospedado (sin token de auth) ──
export interface PublicFormDTO { clinica: { nombre: string; logoUrl: string | null; direccion: string; telefono: string; ciudad: string }; pixelId: string | null }

async function pub<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`)
  return data as T
}
export const publicCrm = {
  form: (slug: string, token: string) => pub<PublicFormDTO>('GET', `/public/crm/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  enviar: (slug: string, token: string, body: Record<string, unknown>) => pub<{ ok: true; leadId: string }>('POST', `/public/crm/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/lead`, body),
}
