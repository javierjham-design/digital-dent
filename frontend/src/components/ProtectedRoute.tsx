import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { setPaisMoneda } from '@/lib/money'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, cargando } = useAuth()
  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  // Fija el país de la clínica (moneda) antes de renderizar cualquier pantalla.
  setPaisMoneda(user.pais)
  return <>{children}</>
}
