'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type ClinicaInfo = { slug: string; nombre: string; logoUrl: string | null } | null

export function LoginClient({ clinica }: { clinica: ClinicaInfo }) {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const modoClinica = clinica !== null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload: any = { password, redirect: false }
    if (modoClinica) {
      payload.slug = clinica!.slug
      payload.username = identifier
    } else {
      payload.email = identifier
    }

    const res = await signIn('credentials', payload)
    if (res?.error) {
      setError(modoClinica ? 'Usuario o contraseña incorrectos.' : 'Credenciales incorrectas.')
      setLoading(false)
      return
    }

    try {
      const r = await fetch('/api/auth/whoami', { cache: 'no-store' })
      const data = await r.json()
      let dest = '/'
      if (data.isPlatformAdmin) dest = '/digital-dent-super-admin'
      else if (data.requirePasswordChange) dest = '/cambiar-password'
      router.push(dest)
      router.refresh()
    } catch {
      router.push('/')
      router.refresh()
    }
  }

  const titulo = modoClinica ? clinica!.nombre : 'Plataforma Dental'
  const subtitulo = modoClinica ? 'Ingresa con tu usuario de la clínica' : 'Acceso administrador'

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-cyan-600 via-cyan-700 to-teal-800 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          {modoClinica && clinica!.logoUrl ? (
            <img src={clinica!.logoUrl} alt={clinica!.nombre} className="w-10 h-10 rounded-xl object-contain bg-white/10" />
          ) : (
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          )}
          <span className="text-xl font-bold tracking-tight">{titulo}</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            {modoClinica ? 'Bienvenido a' : 'Gestión dental'}<br />
            {modoClinica ? clinica!.nombre : 'inteligente y simple'}
          </h1>
          <p className="text-cyan-100 text-lg leading-relaxed">
            {modoClinica
              ? 'Tu plataforma para gestionar agenda, pacientes, presupuestos y cobros.'
              : 'Agenda, pacientes, ficha clínica y cobros — todo en un solo lugar.'}
          </p>
        </div>

        <p className="text-cyan-200 text-sm">
          {modoClinica ? `${clinica!.slug}.plataforma` : 'Plataforma Dental'}
        </p>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Bienvenido</h2>
            <p className="text-slate-500 mb-8">{subtitulo}</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {modoClinica ? 'Usuario' : 'Correo electrónico'}
                </label>
                <input
                  type={modoClinica ? 'text' : 'email'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={modoClinica ? 'Administrador' : 'doctor@ejemplo.cl'}
                  required
                  autoComplete={modoClinica ? 'username' : 'email'}
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
                disabled={loading}
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
                ) : 'Ingresar'}
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
