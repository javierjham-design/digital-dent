import { api } from './api'

export type GrupoDoc = 'CONSENTIMIENTO' | 'DOCUMENTO'
export interface PlantillaConsentimiento {
  id: string; categoria?: string; codigo: string; titulo: string; contenidoHtml: string
  camposRequeridos: string; activo: boolean; orden: number; version: number
}
export interface ConsentimientoResumen {
  id: string; categoria?: string; codigo: string; titulo: string; estado: string
  firmaTipo: string | null; firmadoAt: string | null; generadoPorNombre: string | null
  responsableNombre?: string | null; planId?: string | null; createdAt: string
}
export interface Consentimiento extends ConsentimientoResumen {
  pacienteId: string; contenidoHtml: string
}
export interface VariableManual { name: string; label: string }
export interface Previsualizacion { faltantes: string[]; html: string; titulo: string; codigo: string; manuales: VariableManual[] }

export const consentimientosService = {
  // Plantillas. grupo: 'CONSENTIMIENTO' (default) o 'DOCUMENTO' (recetas/certificados/etc.)
  plantillas: (soloActivas = false, grupo: GrupoDoc = 'CONSENTIMIENTO') => {
    const p = new URLSearchParams(); if (soloActivas) p.set('activas', '1'); if (grupo === 'DOCUMENTO') p.set('grupo', 'DOCUMENTO')
    const qs = p.toString(); return api.get<PlantillaConsentimiento[]>(`/consentimientos/plantillas${qs ? `?${qs}` : ''}`)
  },
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
  porPaciente: (pacienteId: string, grupo?: GrupoDoc) => api.get<ConsentimientoResumen[]>(`/pacientes/${pacienteId}/consentimientos${grupo ? `?grupo=${grupo}` : ''}`),
  obtener: (id: string) => api.get<Consentimiento>(`/consentimientos/${id}`),
  eliminar: (id: string) => api.del<{ ok: true }>(`/consentimientos/${id}`),
}
