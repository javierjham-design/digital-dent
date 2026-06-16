import { api } from './api'
import type { CitaDTO, PacienteDTO } from '@shared/types'

export const citasService = {
  listar: (from?: string, to?: string) => {
    const qs = from && to ? `?from=${from}&to=${to}` : ''
    return api.get<CitaDTO[]>(`/citas${qs}`)
  },
  crear: (input: { pacienteId: string; doctorId: string; fecha: string; duracion?: number; tipo?: string; notas?: string; sobrecupo?: boolean }) =>
    api.post<CitaDTO>('/citas', input),
  cambiarEstado: (id: string, estado: string) =>
    api.patch<CitaDTO>(`/citas/${id}/estado`, { estado }),
}

export const pacientesService = {
  listar: (q?: string) => api.get<PacienteDTO[]>(`/pacientes${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  obtener: (id: string) => api.get<PacienteDTO>(`/pacientes/${id}`),
  crear: (input: { nombre: string; apellido: string; rut?: string; telefono?: string; email?: string; prevision?: string }) =>
    api.post<PacienteDTO>('/pacientes', input),
}
