'use client'

import { useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type ClinicaInfo = { slug: string; nombre: string; logoUrl: string | null }
type SesionActiva = 'super-admin' | 'clinica' | null

export function LoginClient({
  clinica,
  sesionActiva,
}: {
  clinica: ClinicaInfo
  sesionActiva: SesionActiva
}) {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [cerrandoSesion, setCerrandoSesion] = useState(false)
  const [sesionLocal, setSesionLocal] = useState<SesionActiva>(sesionActiva)

  async function cerrarSesionActual() {
    setCerrandoSesion(true)
    await signOut({ redirect: false })
    setSesionLocal(null)
    setCerrandoSesion(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await signIn('credentials', {
      slug: clinica.slug,
      username,
      password,
      redirect: false,
    })
    if (res?.error) {
      setError('Usuario o contraseña incorrectos.')
      setLoading(false)
      return
    }

    try {
      const r = await fetch('/api/auth/whoami', { cache: 'no-store' })
      const data = await r.json()
      if (data.isPlatformAdmin) {
        await signOut({ redirect: false })
        setError('Esta URL es para clínicas. Si eres super-administrador, usa la URL del panel.')
        setLoading(false)
        return
      }
      const dest = data.requirePasswordChange ? '/cambiar-password' : '/'
      router.push(dest)
      router.refresh()
    } catch {
      router.push('/')
      router.refresh()
    }
  }

  const sesionBloqueada = sesionLocal !== null

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-cyan-600 via-cyan-700 to-teal-800 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          {clinica.logoUrl ? (
            <img src={clinica.logoUrl} alt={clinica.nombre} className="w-10 h-10 rounded-xl object-contain bg-white/10" />
          ) : (
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          )}
          <span className="text-xl font-bold tracking-tight">{clinica.nombre}</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Bienvenido a<br />
            {clinica.nombre}
          </h1>
          <p className="text-cyan-100 text-lg leading-relaxed">
            Tu plataforma para gestionar agenda, pacientes, presupuestos y cobros.
          </p>
        </div>

        <p className="text-cyan-200 text-sm">{clinica.slug}</p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Header con identidad de la clínica — siempre visible (también en móvil) */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {clinica.logoUrl ? (
              <img src={clinica.logoUrl} alt={clinica.nombre} className="w-10 h-10 rounded-xl object-contain bg-white border border-slate-200" />
            ) : (
              <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-xl flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
            )}
            <span className="text-lg font-bold text-slate-900 tracking-tight">{clinica.nombre}</span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">
              Iniciar sesión en {clinica.nombre}
            </h2>
            <p className="text-slate-500 mb-6">Ingresa con tu usuario de la clínica</p>

            {sesionBloqueada && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2 mb-3">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">
                      Ya tienes una sesión activa
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {sesionLocal === 'super-admin'
                        ? 'Estás logueado como super-administrador en este navegador. Para entrar a esta clínica debes cerrar tu sesión actual.'
                        : 'Estás logueado en otra clínica en este navegador. Cierra tu sesión actual para entrar a esta.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cerrarSesionActual}
                  disabled={cerrandoSesion}
                  className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                >
                  {cerrandoSesion ? 'Cerrando sesión...' : 'Cerrar sesión y continuar'}
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className={`space-y-5 ${sesionBloqueada ? 'opacity-40 pointer-events-none' : ''}`}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Usuario</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Administrador"
                  required
                  autoComplete="username"
                  disabled={sesionBloqueada}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  disabled={sesionBloqueada}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent bg-slate-50"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || sesionBloqueada}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Ingresando...
                  </>
                ) : `Ingresar a ${clinica.nombre}`}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Plataforma Dental © {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}

export function NoSlugLanding() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-cyan-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">Acceso por clínica</h1>
        <p className="text-slate-600 text-sm mb-2">
          Esta plataforma se accede vía la URL específica de tu clínica.
        </p>
        <p className="text-slate-500 text-xs">
          Si no la conoces, contacta al administrador de tu clínica.
        </p>
        <p className="text-slate-400 text-xs mt-8">
          Plataforma Dental © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
