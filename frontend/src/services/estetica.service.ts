import { api } from './api'

// Área estética: zonas faciales (capa 1, clínica/facturable) y dibujo libre
// (capa 2, anotación). Capas separadas: ver GraficoFacial.tsx.

export interface ZonaFacialDTO { id: string; codigo: string; nombre: string; grupo: string; orden: number; activo: boolean }
export interface ZonaFichaDTO { id: string; zonaId: string; estado: string; color: string | null; notas: string | null; zona: { codigo: string; nombre: string; grupo: string } }
export interface TrazoDTO { herramienta: 'lapiz' | 'circulo' | 'linea'; color?: string; grosor?: number; puntos: { x: number; y: number }[] }
export interface DibujoDTO { genero: string; trazos: TrazoDTO[]; updatedAt: string | null }

export const esteticaService = {
  zonas: () => api.get<ZonaFacialDTO[]>('/zonas-faciales'),
  zonasFicha: (pacienteId: string) => api.get<ZonaFichaDTO[]>(`/pacientes/${pacienteId}/zonas-faciales`),
  marcarZona: (pacienteId: string, body: { zonaId: string; estado?: string; color?: string | null; notas?: string | null }) =>
    api.put<ZonaFichaDTO>(`/pacientes/${pacienteId}/zonas-faciales`, body),
  dibujo: (pacienteId: string) => api.get<DibujoDTO>(`/pacientes/${pacienteId}/dibujo-facial`),
  guardarDibujo: (pacienteId: string, body: { genero?: string; trazos?: TrazoDTO[] }) =>
    api.put<DibujoDTO>(`/pacientes/${pacienteId}/dibujo-facial`, body),
}
