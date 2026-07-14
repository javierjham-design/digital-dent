import { api } from './api'
import type { DoctorDTO, HorarioDTO, UsuarioDTO } from '@shared/types'

export interface CupoProfesionales { activos: number; limite: number; base: number; extra: number; precioExtra: number }

export const usuariosService = {
  listar: () => api.get<UsuarioDTO[]>('/usuarios'),
  doctores: () => api.get<DoctorDTO[]>('/doctores'),
  cupoProfesionales: () => api.get<CupoProfesionales>('/usuarios/cupo-profesionales'),
  crear: (input: { name: string; username: string; password: string; role?: string; titulo?: string; email?: string; rut?: string; especialidad?: string; telefono?: string }) =>
    api.post<UsuarioDTO>('/usuarios', input),
  actualizar: (id: string, patch: Partial<UsuarioDTO> & { password?: string }) =>
    api.patch<UsuarioDTO>(`/usuarios/${id}`, patch),
}

export const horariosService = {
  listar: (doctorId?: string) => api.get<HorarioDTO[]>(`/horarios${doctorId ? `?doctorId=${doctorId}` : ''}`),
  guardar: (doctorId: string, days: unknown[]) => api.post<HorarioDTO[]>('/horarios', { doctorId, days }),
}
