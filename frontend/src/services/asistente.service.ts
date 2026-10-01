import { api, tokenStore, ApiError } from './api'
import type {
  EstadoAsistenteDTO, SesionAsistenteDTO, SesionAsistenteDetalleDTO, RespuestaTurnoDTO,
} from '@shared/types'

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1'

export const asistenteService = {
  estado: () => api.get<EstadoAsistenteDTO>('/asistente/estado'),
  listarSesiones: () => api.get<SesionAsistenteDTO[]>('/asistente/sesiones'),
  crearSesion: () => api.post<SesionAsistenteDTO>('/asistente/sesiones'),
  obtenerSesion: (id: string) => api.get<SesionAsistenteDetalleDTO>(`/asistente/sesiones/${id}`),
  eliminarSesion: (id: string) => api.del<void>(`/asistente/sesiones/${id}`),
  enviarMensaje: (id: string, texto: string) => api.post<RespuestaTurnoDTO>(`/asistente/sesiones/${id}/mensajes`, { texto }),
}

// Descarga del Excel de un resultado (fetch con Bearer → blob → descarga; el
// token va en header, no en cookie, así que no se puede navegar directo).
export async function descargarResultadoXlsx(resultadoId: string, nombre: string): Promise<void> {
  const token = tokenStore.get()
  const res = await fetch(`${BASE}/asistente/resultados/${resultadoId}/xlsx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Error ${res.status}`)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
