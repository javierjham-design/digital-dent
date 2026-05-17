'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Resultado = {
  ok: true
  clinica: { id: string; slug: string; nombre: string }
  credenciales: {
    url_subdominio: string
    url_fallback: string
    usuario: string
    contrasena: string
    nota: string
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
}

const RESERVED_SLUGS = new Set([
  'super-admin', 'www', 'admin', 'api', 'app', 'mail',
  'login', 'auth', 'panel', 'dashboard', 'support', 'soporte',
  'help', 'ayuda', 'blog', 'docs', 'status', 'cdn', 'assets', 'static',
])

export default function NuevaClinicaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const [form, setForm] = useState({
    clinicaNombre: '',
    slug: '',
    clinicaCiudad: 'Temuco',
    clinicaDireccion: '',
    clinicaTelefono: '',
    clinicaEmail: '',
    plan: 'TRIAL',
    trialDias: 30,
  })

  function update<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    if (k === 'clinicaNombre' && !form.slug) {
      setForm((f) => ({ ...f, clinicaNombre: v as string, slug: slugify(v as string) }))
    } else {
      setForm((f) => ({ ...f, [k]: v }))
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.clinicaNombre.trim()) return setError('Falta el nombre de la clínica')
    if (!form.slug.trim()) return setError('Falta el código (slug) de la clínica')
    if (RESERVED_SLUGS.has(form.slug)) {
      return setError(`El código "${form.slug}" está reservado por la plataforma. Elige otro.`)
    }

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
      setResultado(data)
      router.refresh()
    } catch (e: any) {
      setError(e.message ?? 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  if (resultado) return <ResultadoCreacion resultado={resultado} />

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/digital-dent-super-admin/clinicas" className="text-sm text-purple-300 hover:text-purple-200">← Volver al listado</Link>
      </div>

      <h1 className="text-3xl font-bold mb-1">Crear clínica nueva</h1>
      <p className="text-slate-400 text-sm mb-8">
        Al crear la clínica se genera automáticamente un usuario <span className="text-white font-medium">Administrador</span> con contraseña <span className="text-white font-mono">ADMIN22</span>. El catálogo de aranceles se copia desde la plantilla.
      </p>

      <form onSubmit={submit} className="space-y-8">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Datos de la clínica</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre *" value={form.clinicaNombre} onChange={(v) => update('clinicaNombre', v)} placeholder="Clínica Dental Sonrisas" />
            <Field label="Código / Subdominio *" value={form.slug} onChange={(v) => update('slug', slugify(v))} placeholder="cumbres" hint="Será la URL: cumbres.tudominio.cl" />
            <Field label="Ciudad" value={form.clinicaCiudad} onChange={(v) => update('clinicaCiudad', v)} />
            <Field label="Teléfono" value={form.clinicaTelefono} onChange={(v) => update('clinicaTelefono', v)} placeholder="+56 9 ..." />
            <Field label="Dirección" value={form.clinicaDireccion} onChange={(v) => update('clinicaDireccion', v)} wide />
            <Field label="Email de contacto" type="email" value={form.clinicaEmail} onChange={(v) => update('clinicaEmail', v)} placeholder="contacto@clinica.cl" wide />
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['TRIAL', 'BASICO', 'PRO'] as const).map((p) => (
              <button key={p} type="button" onClick={() => update('plan', p)}
                className={`text-left rounded-xl border p-4 transition-all ${
                  form.plan === p ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500/30' : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                }`}>
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
          <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
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

function ResultadoCreacion({ resultado }: { resultado: Resultado }) {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-emerald-300">¡Clínica creada!</h1>
        </div>
        <p className="text-emerald-200/80 text-sm">
          <span className="font-bold">{resultado.clinica.nombre}</span> registrada en el sistema. Entrega estas credenciales al administrador de la clínica para que entre por primera vez.
        </p>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">Credenciales de acceso</h2>

        <div className="space-y-4">
          <Credencial label="URL de acceso (cuando esté el dominio)" valor={resultado.credenciales.url_subdominio} />
          <Credencial label="URL temporal (path)" valor={`${typeof window !== 'undefined' ? window.location.origin : ''}${resultado.credenciales.url_fallback}`} />
          <Credencial label="Usuario" valor={resultado.credenciales.usuario} />
          <Credencial label="Contraseña inicial" valor={resultado.credenciales.contrasena} />
        </div>

        <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mt-5">
          ⚠️ {resultado.credenciales.nota}
        </p>
      </section>

      <div className="flex gap-3">
        <Link href={`/digital-dent-super-admin/clinicas/${resultado.clinica.id}`}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold">
          Ver detalle de la clínica
        </Link>
        <Link href="/digital-dent-super-admin/clinicas"
          className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium">
          Volver al listado
        </Link>
      </div>
    </div>
  )
}

function Credencial({ label, valor }: { label: string; valor: string }) {
  function copiar() {
    navigator.clipboard.writeText(valor)
  }
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono break-all">{valor}</code>
        <button onClick={copiar} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 text-sm">Copiar</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, wide, hint }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; wide?: boolean; hint?: string
}) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
