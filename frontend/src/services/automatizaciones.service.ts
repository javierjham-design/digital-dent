import { api } from './api'

export interface Automatizaciones {
  tubotConectado: boolean
  noShow: { horasAuto: number; diasPerdido: number }
  tratamiento: { diasEspera: number }
}

export interface AutomatizacionesInput {
  noShowHorasAuto?: number
  perdidoDias?: number
  tratamientoDiasEspera?: number
}

export const automatizacionesService = {
  obtener: () => api.get<Automatizaciones>('/automatizaciones'),
  guardar: (input: AutomatizacionesInput) => api.put<Automatizaciones>('/automatizaciones', input),
}
