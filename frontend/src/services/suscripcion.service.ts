import { api } from './api'
import type { MonedaCobro } from '@shared/constants/cobro'

export interface EstadoSuscripcion {
  plan: string; planId: string; moneda: MonedaCobro; cicloFacturacion: string | null
  precioPlan: number; montoExtras: number; montoProfesionales: number; profesionalesExtra: number; total: number
  estado: 'TRIAL' | 'AL_DIA' | 'ATRASADO' | 'SUSPENDIDO'
  proximoCobro: string | null; trialHasta: string | null
  cobroAutomatico: boolean; proveedor: string; pasarelaConfigurada: boolean
  metodo: { provider: string; marca: string | null; ultimos4: string | null; exp: string | null } | null
}

export type ResultadoEnlace =
  | { estado: 'ok'; proveedor: string; url: string; ref: string }
  | { estado: 'no_configurada'; proveedor: string; mensaje: string }
  | { estado: 'pendiente'; proveedor: string; mensaje: string }

export const suscripcionService = {
  estado: () => api.get<EstadoSuscripcion>('/suscripcion'),
  enlacePago: (recurrente: boolean) => api.post<ResultadoEnlace>('/suscripcion/enlace-pago', { recurrente }),
}
