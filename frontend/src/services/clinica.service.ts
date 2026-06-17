import { api } from './api'
import type { BloqueoDTO, CitaDTO, HorarioDTO, PacienteDTO } from '@shared/types'

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
  obtener: (id: string) => api.get<PacienteDTO>(`/pacientes/${id}`),
  crear: (input: { nombre: string; apellido: string; rut?: string; telefono?: string; email?: string; prevision?: string }) =>
    api.post<PacienteDTO>('/pacientes', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<PacienteDTO>(`/pacientes/${id}`, patch),
  ficha: (id: string) => api.get<{ ficha: FichaClinica | null; odontograma: DienteDTO[] }>(`/pacientes/${id}/ficha`),
  guardarFicha: (id: string, body: Record<string, unknown>) => api.put<FichaClinica>(`/pacientes/${id}/ficha`, body),
  citas: (id: string) => api.get<CitaDTO[]>(`/citas?pacienteId=${id}`),
}
