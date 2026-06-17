import { api } from './api'
import type { DoctorDTO, HorarioDTO, UsuarioDTO } from '@shared/types'

export const usuariosService = {
  listar: () => api.get<UsuarioDTO[]>('/usuarios'),
  doctores: () => api.get<DoctorDTO[]>('/doctores'),
  crear: (input: { name: string; username: string; password: string; role?: string; email?: string; rut?: string; especialidad?: string; telefono?: string }) =>
    api.post<UsuarioDTO>('/usuarios', input),
  actualizar: (id: string, patch: Partial<UsuarioDTO> & { password?: string }) =>
    api.patch<UsuarioDTO>(`/usuarios/${id}`, patch),
}

export const horariosService = {
  listar: (doctorId?: string) => api.get<HorarioDTO[]>(`/horarios${doctorId ? `?doctorId=${doctorId}` : ''}`),
  guardar: (doctorId: string, days: unknown[]) => api.post<HorarioDTO[]>('/horarios', { doctorId, days }),
}
