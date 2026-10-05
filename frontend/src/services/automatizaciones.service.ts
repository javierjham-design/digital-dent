import { api } from './api'

export interface PlantillaTubot { name: string; language?: string; category?: string | null; variables?: number | null }

export interface Automatizaciones {
  tubotConectado: boolean
  plantillasDisponibles: PlantillaTubot[]
  maestroActivo: boolean
  confirmaciones: { activo: boolean; hora1: string; segundaActiva: boolean; hora2: string; plantilla: string | null; plantillaInsistencia: string | null }
  noShow: { activo: boolean; horasAuto: number; diasPerdido: number; plantilla: string | null }
  tratamiento: { activo: boolean; diasEspera: number; plantilla: string | null }
}

export interface AutomatizacionesInput {
  maestroActivo?: boolean
  confirmacionesActivo?: boolean
  hora1?: string
  segundaActiva?: boolean
  hora2?: string
  plantillaRecordatorio?: string | null
  plantillaInsistencia?: string | null
  plantillaNoShow?: string | null
  plantillaTratamiento?: string | null
  noShowActivo?: boolean
  tratamientoActivo?: boolean
  noShowHorasAuto?: number
  perdidoDias?: number
  tratamientoDiasEspera?: number
}

export const automatizacionesService = {
  obtener: () => api.get<Automatizaciones>('/automatizaciones'),
  guardar: (input: AutomatizacionesInput) => api.put<Automatizaciones>('/automatizaciones', input),
}
