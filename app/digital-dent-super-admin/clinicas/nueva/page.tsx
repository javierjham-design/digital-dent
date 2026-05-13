'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function NuevaClinicaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    clinicaNombre: '',
    clinicaCiudad: 'Temuco',
    clinicaDireccion: '',
    clinicaTelefono: '',
    clinicaEmail: '',
    adminNombre: '',
    adminEmail: '',
    adminPassword: '',
    plan: 'TRIAL',
    trialDias: 30,
  })

  function update<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.clinicaNombre.trim()) return setError('Falta el nombre de la clínica')
    if (!form.adminNombre.trim()) return setError('Falta el nombre del admin')
    if (!form.adminEmail.trim()) return setError('Falta el email del admin')
    if (form.adminPassword.length < 6) return setError('La contraseña debe tener al menos 6 caracteres')

    setLoading(true)
    try {
      const res = await fetch('/api/admin/clinicas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`)
        return
      }
      router.push(`/digital-dent-super-admin/clinicas/${data.clinica.id}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/digital-dent-super-admin/clinicas" className="text-sm text-purple-300 hover:text-purple-200">← Volver al listado</Link>
      </div>

      <h1 className="text-3xl font-bold mb-1">Crear clínica nueva</h1>
      <p className="text-slate-400 text-sm mb-8">
        Crea una clínica con su primer administrador. El catálogo de aranceles se copia automáticamente de la clínica plantilla.
      </p>

      <form onSubmit={submit} className="space-y-8">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Datos de la clínica</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *" value={form.clinicaNombre} onChange={(v) => update('clinicaNombre', v)} placeholder="Clínica Dental Sonrisas" />
            <Field label="Ciudad" value={form.clinicaCiudad} onChange={(v) => update('clinicaCiudad', v)} />
            <Field label="Dirección" value={form.clinicaDireccion} onChange={(v) => update('clinicaDireccion', v)} />
            <Field label="Teléfono" value={form.clinicaTelefono} onChange={(v) => update('clinicaTelefono', v)} placeholder="+56 9 ..." />
            <Field label="Email de la clínica" type="email" value={form.clinicaEmail} onChange={(v) => update('clinicaEmail', v)} placeholder="contacto@clinica.cl" wide />
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Administrador inicial</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *" value={form.adminNombre} onChange={(v) => update('adminNombre', v)} />
            <Field label="Email de acceso *" type="email" value={form.adminEmail} onChange={(v) => update('adminEmail', v)} placeholder="doctor@clinica.cl" />
            <Field label="Contraseña *" type="password" value={form.adminPassword} onChange={(v) => update('adminPassword', v)} placeholder="mínimo 6 caracteres" wide />
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['TRIAL', 'BASICO', 'PRO'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => update('plan', p)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  form.plan === p
                    ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                }`}
              >
                <p className="font-semibold">{p}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {p === 'TRIAL' ? '30 días gratis' : p === 'BASICO' ? '$19.900/mes' : '$39.900/mes'}
                </p>
              </button>
            ))}
          </div>
          {form.plan === 'TRIAL' && (
            <div className="mt-4">
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Días de prueba</label>
              <input type="number" min={1} max={365} value={form.trialDias}
                onChange={(e) => update('trialDias', Number(e.target.value))}
                className="w-32 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          )}
        </section>

        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-xl font-semibold transition-colors">
            {loading ? 'Creando clínica...' : 'Crear clínica'}
          </button>
          <Link href="/digital-dent-super-admin/clinicas"
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, wide }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; wide?: boolean
}) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
    </div>
  )
}
