import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { LoginRequest, LoginResult, SessionUserDTO, Setup2FAResponse } from '@shared/types'
import { authService } from '@/services/auth.service'
import { tokenStore } from '@/services/api'

interface AuthContextValue {
  user: SessionUserDTO | null
  cargando: boolean
  // Clínica → sesión (setea user). Super-admin → desafío 2FA (no setea user todavía).
  login: (body: LoginRequest) => Promise<LoginResult>
  setup2FA: (desafio: string) => Promise<Setup2FAResponse>
  verify2FA: (desafio: string, codigo: string) => Promise<SessionUserDTO>
  logout: () => void
  refrescar: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// Lee el `exp` (ms epoch) del JWT sin librerías. null si no se puede decodificar.
function tokenExpMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUserDTO | null>(null)
  const [cargando, setCargando] = useState(true)
  const [sesionPorExpirar, setSesionPorExpirar] = useState(false)

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

  // Cierre de sesión proactivo: a las 12 h del login (exp del JWT) la sesión se
  // cierra sola aunque la pestaña esté inactiva (no espera a la próxima request).
  // 10 minutos antes se muestra un aviso: el cierre en seco a mitad de una evolución
  // o un cobro perdía el trabajo del usuario sin ninguna advertencia.
  useEffect(() => {
    if (!user) return
    const token = tokenStore.get()
    const exp = token ? tokenExpMs(token) : null
    if (!exp) return
    const ms = exp - Date.now()
    const cerrar = () => { tokenStore.clear(); setUser(null) } // ProtectedRoute redirige a /login
    if (ms <= 0) { cerrar(); return }
    const t = setTimeout(cerrar, ms)
    let aviso: ReturnType<typeof setTimeout> | null = null
    if (ms > 10 * 60_000) {
      setSesionPorExpirar(false)
      aviso = setTimeout(() => setSesionPorExpirar(true), ms - 10 * 60_000)
    } else {
      setSesionPorExpirar(true)
    }
    return () => { clearTimeout(t); if (aviso) clearTimeout(aviso) }
  }, [user])

  const login = async (body: LoginRequest) => {
    const res = await authService.login(body)
    if ('token' in res) setUser(res.user) // sesión directa (clínica); super-admin va por 2FA
    return res
  }

  const setup2FA = (desafio: string) => authService.setup2FA(desafio)

  const verify2FA = async (desafio: string, codigo: string) => {
    const u = await authService.verify2FA(desafio, codigo)
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
    <AuthContext.Provider value={{ user, cargando, login, setup2FA, verify2FA, logout, refrescar }}>
      {user && sesionPorExpirar && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-white text-sm font-medium text-center px-4 py-2 shadow">
          Tu sesión expira en menos de 10 minutos. Guarda lo que estés haciendo: luego deberás iniciar sesión de nuevo.
        </div>
      )}
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
