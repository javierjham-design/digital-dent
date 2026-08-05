import { api, tokenStore } from './api'
import type { LoginRequest, LoginResponse, LoginResult, Setup2FAResponse, SessionUserDTO } from '@shared/types'

export const authService = {
  // Clínica → sesión directa (guarda el token). Super-admin → desafío 2FA (sin token).
  async login(body: LoginRequest): Promise<LoginResult> {
    const res = await api.post<LoginResult>('/auth/login', body)
    if ('token' in res) tokenStore.set(res.token)
    return res
  },
  // Alta de 2FA (una vez): devuelve QR + secreto + códigos de respaldo.
  setup2FA(desafio: string): Promise<Setup2FAResponse> {
    return api.post<Setup2FAResponse>('/auth/2fa/setup', { desafio })
  },
  // Segundo paso: verifica el código (TOTP o de respaldo) y guarda la sesión.
  async verify2FA(desafio: string, codigo: string): Promise<SessionUserDTO> {
    const res = await api.post<LoginResponse>('/auth/2fa/verify', { desafio, codigo })
    tokenStore.set(res.token)
    return res.user
  },
  async me(): Promise<SessionUserDTO> {
    const res = await api.get<{ user: SessionUserDTO }>('/auth/me')
    return res.user
  },
  logout() {
    tokenStore.clear()
  },
  cambiarPassword(currentPassword: string, newPassword: string) {
    return api.post<{ ok: true }>('/auth/cambiar-password', { currentPassword, newPassword })
  },
}
