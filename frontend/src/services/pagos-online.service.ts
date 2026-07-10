import { api } from './api'

export interface PagoOnlineConfig { enabled: boolean; sandbox: boolean; hasApiKey: boolean; hasSecretKey: boolean; configurado: boolean }
export interface PagoOnline { id: string; cobroId: string | null; estado: string; monto: number; url: string | null; createdAt: string; pagadoAt: string | null }
export type ResultadoLink =
  | { estado: 'ok'; url: string; pagoId: string }
  | { estado: 'no_configurada'; mensaje: string }
  | { estado: 'error'; mensaje: string }

export const pagosOnlineService = {
  config: () => api.get<PagoOnlineConfig>('/pagos-online/config'),
  guardarConfig: (input: { enabled?: boolean; sandbox?: boolean; apiKey?: string | null; secretKey?: string | null }) =>
    api.patch<PagoOnlineConfig>('/pagos-online/config', input),
  crearLink: (cobroId: string) => api.post<ResultadoLink>(`/cobros/${cobroId}/link-pago`, {}),
  pagosDeCobro: (cobroId: string) => api.get<PagoOnline[]>(`/cobros/${cobroId}/pagos-online`),
}
