import { api, tokenStore, ApiError } from './api'
import type { BloqueoDTO, CitaDTO, HorarioDTO, PacienteDTO, PacientesPagina } from '@shared/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export const citasService = {
  listar: (from?: string, to?: string) => {
    const qs = from && to ? `?from=${from}&to=${to}` : ''
    return api.get<CitaDTO[]>(`/citas${qs}`)
  },
  crear: (input: { pacienteId: string; doctorId: string; fecha: string; duracion?: number; tipo?: string; notas?: string; sobrecupo?: boolean }) =>
    api.post<CitaDTO>('/citas', input),
  editar: (id: string, input: { fecha?: string; duracion?: number; doctorId?: string; tipo?: string; notas?: string | null; sobrecupo?: boolean }) =>
    api.patch<CitaDTO>(`/citas/${id}`, input),
  cambiarEstado: (id: string, estado: string) =>
    api.patch<CitaDTO>(`/citas/${id}/estado`, { estado }),
  eliminar: (id: string) => api.del<{ ok: true }>(`/citas/${id}`),
}

export const bloqueosService = {
  listar: (from?: string, to?: string, doctorId?: string) => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (doctorId) p.set('doctorId', doctorId)
    const qs = p.toString()
    return api.get<BloqueoDTO[]>(`/bloqueos${qs ? `?${qs}` : ''}`)
  },
  crear: (input: { doctorId: string; inicio: string; fin: string; motivo?: string }) =>
    api.post<BloqueoDTO>('/bloqueos', input),
  eliminar: (id: string) => api.del<{ ok: true }>(`/bloqueos/${id}`),
}

export const horariosLectura = {
  listar: (doctorId?: string) => api.get<HorarioDTO[]>(`/horarios${doctorId ? `?doctorId=${doctorId}` : ''}`),
}

export interface FichaClinica {
  grupoSanguineo: string | null; fumador: boolean; embarazada: boolean; diabetico: boolean
  hipertenso: boolean; cardiopatia: boolean; medicamentos: string | null
  notasClinicas: string | null; alertasMedicas: string | null; enfermedadesNotas: string | null
}
export interface DienteDTO { numero: number; cara: string; estado: string }

export const pacientesService = {
  listar: (q?: string) => api.get<PacienteDTO[]>(`/pacientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  listarPaginado: (q: string | undefined, page: number, pageSize: number) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    p.set('page', String(page))
    p.set('pageSize', String(pageSize))
    return api.get<PacientesPagina>(`/pacientes?${p.toString()}`)
  },
  obtener: (id: string) => api.get<PacienteDTO>(`/pacientes/${id}`),
  crear: (input: { nombre: string; apellido: string; rut?: string; telefono?: string; email?: string; prevision?: string }) =>
    api.post<PacienteDTO>('/pacientes', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<PacienteDTO>(`/pacientes/${id}`, patch),
  ficha: (id: string) => api.get<{ ficha: FichaClinica | null; odontograma: DienteDTO[] }>(`/pacientes/${id}/ficha`),
  guardarFicha: (id: string, body: Record<string, unknown>) => api.put<FichaClinica>(`/pacientes/${id}/ficha`, body),
  citas: (id: string) => api.get<CitaDTO[]>(`/citas?pacienteId=${id}`),
  resumen: (id: string) => api.get<ResumenPaciente>(`/pacientes/${id}/resumen`),
  comentarios: (id: string) => api.get<ComentarioDTO[]>(`/pacientes/${id}/comentarios`),
  agregarComentario: (id: string, texto: string) => api.post<ComentarioDTO>(`/pacientes/${id}/comentarios`, { texto }),
  mensajes: (id: string) => api.get<MensajeDTO[]>(`/pacientes/${id}/mensajes`),
}

export interface ResumenPaciente { tratamientosCount: number; activos: number; finalizados: number; expirados: number; realizado: number; abonado: number; saldo: number }
export interface ComentarioDTO { id: string; texto: string; autorNombre: string | null; createdAt: string }
export interface MensajeDTO { id: string; tipo: string; categoria: string; asunto: string | null; cuerpo: string | null; enviadoA: string | null; estado: string; createdAt: string }

export interface ImportResultado { total: number; creados: number; duplicados: number; sinRut: number; errores: { fila: number; motivo: string }[] }

// Descargas/subidas que no pasan por el wrapper JSON (blob / multipart).
export const pacientesIO = {
  async exportar() { await descargar('/pacientes/export', `pacientes-${new Date().toISOString().slice(0, 10)}.xlsx`) },
  async plantilla() { await descargar('/pacientes/template', 'plantilla-pacientes.xlsx') },
  async importar(file: File): Promise<ImportResultado> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`${BASE}/pacientes/import`, {
      method: 'POST',
      headers: tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {},
      body: fd,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Error ${res.status}`)
    return data as ImportResultado
  },
}

async function descargar(path: string, filename: string) {
  const token = tokenStore.get()
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Error ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}
