import { api } from './api'

export interface Automatizaciones {
  whatsappConectado: boolean
  recordatorios: { activo: boolean; horasAntes: number }
  noShow: { horasAuto: number; diasPerdido: number }
  recaptura: {
    noShow: { activo: boolean; plantilla: string | null }
    tratamiento: { activo: boolean; plantilla: string | null; dias: number }
  }
}

export interface AutomatizacionesInput {
  recordatoriosHorasAntes?: number
  noShowHorasAuto?: number
  perdidoDias?: number
  recapturaNoShowEnabled?: boolean
  waTemplateRecapturaNoShow?: string | null
  recapturaTratEnabled?: boolean
  waTemplateRecapturaTrat?: string | null
  recapturaTratDias?: number | null
}

export const automatizacionesService = {
  obtener: () => api.get<Automatizaciones>('/automatizaciones'),
  guardar: (input: AutomatizacionesInput) => api.put<Automatizaciones>('/automatizaciones', input),
}
