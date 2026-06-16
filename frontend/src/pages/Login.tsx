import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [slug, setSlug] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setError('')
    try {
      await login({ slug, username, password })
      navigate('/agenda')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-cyan-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-800 text-white font-bold flex items-center justify-center">C</div>
          <span className="text-lg font-bold tracking-tight">Cláriva</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">Iniciar sesión</h1>
        <p className="text-sm text-slate-500 mb-6">Ingresa con las credenciales de tu clínica.</p>

        <label className="block mb-3">
          <span className="block text-sm font-medium text-slate-700 mb-1">Código de la clínica</span>
          <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mi-clinica" required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block mb-3">
          <span className="block text-sm font-medium text-slate-700 mb-1">Usuario</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Administrador" required
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block mb-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">Contraseña</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>

        {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <button type="submit" disabled={cargando}
          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors">
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
