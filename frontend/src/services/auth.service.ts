import { api, tokenStore } from './api'
import type { LoginRequest, LoginResponse, SessionUserDTO } from '@shared/types'

export const authService = {
  async login(body: LoginRequest): Promise<SessionUserDTO> {
    const res = await api.post<LoginResponse>('/auth/login', body)
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
}
