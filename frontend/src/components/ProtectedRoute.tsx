import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, cargando } = useAuth()
  if (cargando) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Cargando…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
