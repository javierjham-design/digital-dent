import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { LoginRequest, SessionUserDTO } from '@shared/types'
import { authService } from '@/services/auth.service'
import { tokenStore } from '@/services/api'

interface AuthContextValue {
  user: SessionUserDTO | null
  cargando: boolean
  login: (body: LoginRequest) => Promise<SessionUserDTO>
  logout: () => void
  refrescar: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUserDTO | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    // Handoff de sesión desde la landing/demo: si llega ?#token=<jwt> en la URL
    // (otro origen no puede compartir localStorage), lo guardamos y limpiamos.
    const hash = window.location.hash
    const m = hash.match(/[#&]token=([^&]+)/)
    if (m) {
      tokenStore.set(decodeURIComponent(m[1]))
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
    if (!tokenStore.get()) { setCargando(false); return }
    authService.me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setCargando(false))
  }, [])

  const login = async (body: LoginRequest) => {
    const u = await authService.login(body)
    setUser(u)
    return u
  }

  const logout = () => {
    authService.logout()
    setUser(null)
  }

  const refrescar = async () => {
    if (!tokenStore.get()) return
    setUser(await authService.me())
  }

  return (
    <AuthContext.Provider value={{ user, cargando, login, logout, refrescar }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
