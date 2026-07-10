import { api } from './api'

export type TipoEmail = 'CONFIRMACION_HORA' | 'PRESUPUESTO' | 'CONSENTIMIENTO' | 'DOCUMENTO' | 'COMPROBANTE' | 'PLAN' | 'DEUDA' | 'OTRO'

export interface EmailEnviado {
  id: string; para: string; asunto: string; tipo: string; pacienteId: string | null
  estado: string; error: string | null; enviadoPorNombre: string | null; createdAt: string
}

export interface EnviarEmailInput {
  to: string; tipo: TipoEmail; asunto: string
  mensaje?: string; html?: string
  pacienteId?: string; pacienteNombre?: string
  pdfBase64?: string; pdfNombre?: string
}

export const emailService = {
  enviar: (input: EnviarEmailInput) => api.post<{ ok: true }>('/emails/enviar', input),
  historial: (pacienteId?: string) => api.get<EmailEnviado[]>(`/emails${pacienteId ? `?pacienteId=${encodeURIComponent(pacienteId)}` : ''}`),
}
