import { api } from './api'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export interface Ventana { id?: string; diaSemana: number; horaInicio: string; horaFin: string }
export interface LinkAgendaDTO {
  id: string; token: string; nombre: string; descripcion: string | null; doctorId: string
  tipoCita: string; duracionMin: number; usaHorarioDoctor: boolean; anticipacionHoras: number
  diasMaxFuturo: number; mensajeConfirmacion: string | null; color: string | null; activo: boolean
  doctor: { id: string; name: string | null; email: string | null; especialidad: string | null }
  ventanas: Ventana[]; reservas: number; createdAt: string
}
export interface ReservaOnline {
  id: string; fecha: string; duracion: number; estado: string; tipo: string | null; notas: string | null
  linkAgendaId: string | null; createdAt: string
  paciente: { id: string; nombre: string; apellido: string; telefono: string | null; rut: string | null }
  doctor: { name: string | null }
}

export const agendaOnlineService = {
  listar: () => api.get<{ slug: string; links: LinkAgendaDTO[] }>('/agenda-links'),
  crear: (input: Record<string, unknown>) => api.post<LinkAgendaDTO>('/agenda-links', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<LinkAgendaDTO>(`/agenda-links/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/agenda-links/${id}`),
  reservas: (linkId?: string) => api.get<ReservaOnline[]>(`/reservas-online${linkId ? `?linkId=${linkId}` : ''}`),
}

// ── Público (sin token, sin redirect a login) ──
export interface PublicAgendaDTO {
  clinica: { nombre: string; logoUrl: string | null; direccion: string; telefono: string; ciudad: string }
  link: { nombre: string; descripcion: string | null; tipoCita: string; duracionMin: number; profesional: string | null; especialidad: string | null; color: string | null; mensajeConfirmacion: string | null }
  dias: { dia: string; slots: { inicio: string; hora: string }[] }[]
}
export interface ReservaResult { ok: true; citaId: string; inicio: string; duracionMin: number; profesional: string | null; mensaje: string | null }

async function pub<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`)
  return data as T
}

export const publicAgenda = {
  obtener: (slug: string, token: string) => pub<PublicAgendaDTO>('GET', `/public/agenda/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`),
  reservar: (slug: string, token: string, body: Record<string, unknown>) => pub<ReservaResult>('POST', `/public/agenda/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/reservar`, body),
}
