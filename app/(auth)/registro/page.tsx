'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function RegistroPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    clinicaNombre: '',
    clinicaCiudad: 'Temuco',
    clinicaTelefono: '',
    clinicaDireccion: '',
    clinicaEmail: '',
    adminNombre: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
  })

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  function continuar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.clinicaNombre.trim()) { setError('El nombre de la clínica es obligatorio'); return }
    setStep(2)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.adminPassword !== form.adminPasswordConfirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    if (form.adminPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/clinicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setLoading(false)
        return
      }

      const signin = await signIn('credentials', {
        email: form.adminEmail,
        password: form.adminPassword,
        redirect: false,
      })
      if (signin?.error) {
        setError('Cuenta creada, pero falló el inicio de sesión. Intenta entrar manualmente.')
        setLoading(false)
        return
      }
      router.push('/agenda')
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-cyan-600 via-cyan-700 to-teal-800 flex-col justify-between p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">Plataforma Dental</span>
        </div>

        <div>
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Crea tu clínica<br />en 2 minutos
          </h1>
          <p className="text-cyan-100 text-lg leading-relaxed">
            Empezarás con 30 días de prueba gratuita. Incluye el arancel dental chileno completo, sin tarjeta de crédito.
          </p>
        </div>

        <ul className="space-y-3 text-cyan-100">
          {[
            'Agenda con confirmación por WhatsApp',
            'Ficha clínica + odontograma digital',
            '764 prestaciones precargadas',
            'Presupuestos y cobros con un click',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-bold text-slate-900">
                {step === 1 ? 'Datos de la clínica' : 'Tu cuenta de administrador'}
              </h2>
              <span className="text-xs font-medium text-slate-400">Paso {step} de 2</span>
            </div>
            <p className="text-slate-500 mb-6">
              {step === 1 ? 'Información básica de tu clínica' : 'Usuarios adicionales podrás invitarlos luego'}
            </p>

            <form onSubmit={step === 1 ? continuar : submit} className="space-y-4">
              {step === 1 ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre de la clínica *</label>
                    <input required value={form.clinicaNombre} onChange={(e) => update('clinicaNombre', e.target.value)}
                      placeholder="Clínica Dental Sonrisas"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Ciudad</label>
                      <input value={form.clinicaCiudad} onChange={(e) => update('clinicaCiudad', e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Teléfono</label>
                      <input value={form.clinicaTelefono} onChange={(e) => update('clinicaTelefono', e.target.value)}
                        placeholder="+56 9 ..."
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Dirección</label>
                    <input value={form.clinicaDireccion} onChange={(e) => update('clinicaDireccion', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email de la clínica</label>
                    <input type="email" value={form.clinicaEmail} onChange={(e) => update('clinicaEmail', e.target.value)}
                      placeholder="contacto@clinica.cl"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Tu nombre *</label>
                    <input required value={form.adminNombre} onChange={(e) => update('adminNombre', e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Email de acceso *</label>
                    <input type="email" required value={form.adminEmail} onChange={(e) => update('adminEmail', e.target.value)}
                      placeholder="doctor@clinica.cl"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Contraseña *</label>
                      <input type="password" required minLength={6} value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Repetir *</label>
                      <input type="password" required value={form.adminPasswordConfirm} onChange={(e) => update('adminPasswordConfirm', e.target.value)}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-slate-50" />
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                {step === 2 && (
                  <button type="button" onClick={() => setStep(1)}
                    className="px-4 py-3 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Atrás
                  </button>
                )}
                <button type="submit" disabled={loading}
                  className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creando clínica...
                    </>
                  ) : step === 1 ? 'Continuar' : 'Crear clínica'}
                </button>
              </div>
            </form>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">Iniciar sesión</a>
          </p>
        </div>
      </div>
    </div>
  )
}
