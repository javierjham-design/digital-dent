import { api } from './api'

export interface GoogleCalendar { id: string; summary: string; primary?: boolean }

// Estado de salud de la integración con Google (para banners de aviso).
export interface GoogleHealth {
  connected: boolean
  problema: 'error' | 'desactualizado' | null
  desde: string | null
  ultimoSync: string | null
  email: string | null
  doctoresMapeados: number
  staleMinutos: number
}

export const googleService = {
  // Estado de la sincronización: conectado / error / desactualizado.
  estado: () => api.get<GoogleHealth>('/google/health'),
  // Devuelve la URL de autorización; el SPA navega a ella para iniciar el OAuth.
  conectar: () => api.get<{ authUrl: string }>('/google/connect'),
  // Lista los calendarios de la cuenta conectada (falla si no está conectada).
  calendarios: () => api.get<GoogleCalendar[]>('/google/calendars'),
  desconectar: () => api.post<{ ok: true }>('/google/disconnect', {}),
  sincronizar: (userId?: string) => api.post<{ summaries: unknown[] }>('/google/sync', userId ? { userId } : {}),
  reconciliarBloqueos: () => api.post<{ total: number; converted: number; skippedCount: number }>('/google/reconcile-bloqueos', {}),
}
