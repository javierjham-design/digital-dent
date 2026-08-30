import { api } from './api'

// Autogestión (por la propia clínica) de la conexión de AGENDA con TuBot: token
// dedicado + webhooks salientes. Ver docs/TUBOT_AGENDA.md.
export interface TubotAgendaEstado {
  hasToken: boolean
  webhook: { enabled: boolean; connectionId: string | null; secretConfigurado: boolean }
}

export const tubotAgendaService = {
  estado: () => api.get<TubotAgendaEstado>('/integraciones/tubot-agenda'),
  generarToken: () => api.post<{ token: string }>('/integraciones/tubot-agenda/token'),
  revocarToken: () => api.del<{ ok: true }>('/integraciones/tubot-agenda/token'),
  guardarWebhook: (input: { enabled: boolean; connectionId: string | null; secret?: string }) =>
    api.put<{ ok: true }>('/integraciones/tubot-agenda/webhook', input),
}
