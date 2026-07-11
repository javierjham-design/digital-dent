import { api } from './api'

export interface PlantillaConsentimiento {
  id: string; codigo: string; titulo: string; contenidoHtml: string
  camposRequeridos: string; activo: boolean; orden: number; version: number
}
export interface ConsentimientoResumen {
  id: string; codigo: string; titulo: string; estado: string
  firmaTipo: string | null; firmadoAt: string | null; generadoPorNombre: string | null
  responsableNombre?: string | null; planId?: string | null; createdAt: string
}
export interface Consentimiento extends ConsentimientoResumen {
  pacienteId: string; contenidoHtml: string
}
export interface VariableManual { name: string; label: string }
export interface Previsualizacion { faltantes: string[]; html: string; titulo: string; codigo: string; manuales: VariableManual[] }

export const consentimientosService = {
  // Plantillas
  plantillas: (soloActivas = false) => api.get<PlantillaConsentimiento[]>(`/consentimientos/plantillas${soloActivas ? '?activas=1' : ''}`),
  crearPlantilla: (input: Record<string, unknown>) => api.post<PlantillaConsentimiento>('/consentimientos/plantillas', input),
  actualizarPlantilla: (id: string, patch: Record<string, unknown>) => api.patch<PlantillaConsentimiento>(`/consentimientos/plantillas/${id}`, patch),
  eliminarPlantilla: (id: string) => api.del<{ ok: true }>(`/consentimientos/plantillas/${id}`),

  // Generación / firma / consulta
  previsualizar: (pacienteId: string, plantillaId: string, responsableId?: string, extra?: Record<string, string>) =>
    api.post<Previsualizacion>('/consentimientos/previsualizar', { pacienteId, plantillaId, responsableId, extra }),
  generar: (pacienteId: string, plantillaId: string, responsableId: string, planId: string, extra?: Record<string, string>) =>
    api.post<Consentimiento>('/consentimientos/generar', { pacienteId, plantillaId, responsableId, planId, extra }),
  firmar: (id: string, body: { tipo: 'MANUAL' | 'DIGITAL'; imagen?: string }) =>
    api.post<Consentimiento>(`/consentimientos/${id}/firmar`, body),
  porPaciente: (pacienteId: string) => api.get<ConsentimientoResumen[]>(`/pacientes/${pacienteId}/consentimientos`),
  obtener: (id: string) => api.get<Consentimiento>(`/consentimientos/${id}`),
  eliminar: (id: string) => api.del<{ ok: true }>(`/consentimientos/${id}`),
}
