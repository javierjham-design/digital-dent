import { api } from './api'
import type { ClinicaConfigDTO, PrestacionDTO } from '@shared/types'

export interface MedioPagoDTO {
  id: string
  nombre: string
  comision: number
  activo: boolean
}

export const prestacionesService = {
  listar: () => api.get<PrestacionDTO[]>('/prestaciones'),
  crear: (input: { nombre: string; categoria?: string; precio: number; descripcion?: string; duracion?: number }) =>
    api.post<PrestacionDTO>('/prestaciones', input),
  actualizar: (id: string, patch: Partial<PrestacionDTO>) => api.patch<PrestacionDTO>(`/prestaciones/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/prestaciones/${id}`),
  dedupe: () => api.post<{ duplicados: number; eliminadas: number; restantes: number }>('/prestaciones/dedupe', {}),
}

export const mediosPagoService = {
  listar: () => api.get<MedioPagoDTO[]>('/medios-pago'),
  crear: (input: { nombre: string; comision?: number }) => api.post<MedioPagoDTO>('/medios-pago', input),
  actualizar: (id: string, patch: Partial<MedioPagoDTO>) => api.patch<MedioPagoDTO>(`/medios-pago/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/medios-pago/${id}`),
}

export const clinicaService = {
  obtener: () => api.get<ClinicaConfigDTO>('/clinica'),
  actualizar: (patch: Partial<ClinicaConfigDTO>) => api.patch<ClinicaConfigDTO>('/clinica', patch),
}
