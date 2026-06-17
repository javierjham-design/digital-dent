import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [modo, setModo] = useState<'clinica' | 'plataforma'>('clinica')
  const [slug, setSlug] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setError('')
    try {
      const u = modo === 'clinica' ? await login({ slug, username, password }) : await login({ email, password })
      navigate(u.isPlatformAdmin ? '/plataforma' : '/agenda')
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
        <p className="text-sm text-slate-500 mb-5">{modo === 'clinica' ? 'Ingresa con las credenciales de tu clínica.' : 'Acceso de administración de la plataforma.'}</p>

        {modo === 'clinica' ? (
          <>
            <Field label="Código de la clínica" value={slug} onChange={setSlug} placeholder="mi-clinica" />
            <Field label="Usuario" value={username} onChange={setUsername} placeholder="Administrador" />
          </>
        ) : (
          <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="admin@clariva.cl" />
        )}
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

        <button type="button" onClick={() => { setModo(modo === 'clinica' ? 'plataforma' : 'clinica'); setError('') }}
          className="w-full mt-3 text-xs text-slate-400 hover:text-slate-600">
          {modo === 'clinica' ? 'Soy administrador de la plataforma' : '← Volver al acceso de clínica'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
    </label>
  )
}
