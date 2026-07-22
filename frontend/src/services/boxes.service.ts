import { api } from './api'

export interface BoxDTO { id: string; nombre: string; tipo: string | null; orden: number; activo: boolean }

export const boxesService = {
  listar: (soloActivas = false) => api.get<BoxDTO[]>(`/boxes${soloActivas ? '?activas=1' : ''}`),
  crear: (input: { nombre: string; tipo?: string }) => api.post<BoxDTO>('/boxes', input),
  actualizar: (id: string, patch: Record<string, unknown>) => api.patch<BoxDTO>(`/boxes/${id}`, patch),
  eliminar: (id: string) => api.del<{ ok: true }>(`/boxes/${id}`),
}
