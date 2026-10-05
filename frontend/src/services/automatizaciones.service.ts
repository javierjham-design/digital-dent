import { api } from './api'

export interface Automatizaciones {
  tubotConectado: boolean
  maestroActivo: boolean
  confirmaciones: { activo: boolean }
  noShow: { activo: boolean; horasAuto: number; diasPerdido: number }
  tratamiento: { activo: boolean; diasEspera: number }
}

export interface AutomatizacionesInput {
  maestroActivo?: boolean
  confirmacionesActivo?: boolean
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
