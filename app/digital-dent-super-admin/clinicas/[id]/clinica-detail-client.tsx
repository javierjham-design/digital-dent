'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { AccesoClinicaCard } from '../acceso-clinica'

type Clinica = {
  id: string; slug: string; nombre: string
  rut: string | null; direccion: string; ciudad: string
  telefono: string; email: string
  plan: string; activo: boolean
  trialHasta: string | null; createdAt: string; updatedAt: string
  precioMensual: number
  stats: {
    usuarios: number; pacientes: number
    pacientesConAgenda: number; pacientesSinAgenda: number
    citas: number
    volumenCobrado: number; totalCobros: number
    volumen90d: number
  }
  storage: { bytesUsados: number; cuotaBytes: number }
  adminInicial: { name: string | null; email: string | null; role: string; createdAt: string } | null
}

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

function fmtBytes(n: number): string {
  if (n === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function ClinicaDetailClient({
  clinica: initial,
  platformDomain,
  passwordPendiente,
}: {
  clinica: Clinica
  platformDomain: string | null
  passwordPendiente: boolean
}) {
  const router = useRouter()
  const [c, setC] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: c.nombre, ciudad: c.ciudad, direccion: c.direccion,
    telefono: c.telefono, email: c.email, plan: c.plan,
  })

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/clinicas/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Error: ${j.error ?? res.status}`)
        return
      }
      const updated = await res.json()
      setC({ ...c, ...updated })
      setEditing(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function toggleActivo() {
    if (!confirm(c.activo ? '¿Suspender esta clínica? Los usuarios no podrán entrar.' : '¿Reactivar esta clínica?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/clinicas/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: !c.activo }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(`Error: ${j.error ?? res.status}`)
        return
      }
      const updated = await res.json()
      setC({ ...c, activo: updated.activo })
      router.refresh()
    } finally { setSaving(false) }
  }

  const trialDias = daysUntil(c.trialHasta)
  const storagePct = c.storage.cuotaBytes > 0 ? (c.storage.bytesUsados / c.storage.cuotaBytes) * 100 : 0

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/digital-dent-super-admin/clinicas" className="text-sm text-purple-300 hover:text-purple-200">← Volver al listado</Link>
      </div>

      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">{c.nombre}</h1>
          <p className="text-slate-500 text-sm mt-1 font-mono">{c.slug}</p>
          <div className="flex gap-2 mt-3">
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300">{c.plan}</span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              c.activo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
            }`}>
              {c.activo ? 'Activa' : 'Suspendida'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">
              Editar datos
            </button>
          )}
          <button onClick={toggleActivo} disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              c.activo
                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
                : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'
            }`}>
            {c.activo ? 'Suspender' : 'Reactivar'}
          </button>
        </div>
      </div>

      {/* ACCESO DE LA CLÍNICA */}
      <div className="mb-6">
        <AccesoClinicaCard
          slug={c.slug}
          platformDomain={platformDomain}
          passwordPendiente={passwordPendiente}
        />
      </div>

      {/* SUSCRIPCIÓN / PLAN */}
      <section className="bg-gradient-to-br from-purple-500/10 to-fuchsia-500/10 border border-purple-500/30 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          Suscripción a la plataforma
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">Plan actual</p>
            <p className="text-2xl font-bold mt-1">{c.plan}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">Cobro mensual</p>
            <p className="text-2xl font-bold mt-1">{c.precioMensual > 0 ? fmtCLP(c.precioMensual) : 'Sin cobro'}</p>
            {c.precioMensual > 0 && <p className="text-xs text-purple-300/60 mt-1">Estimado · Pasarela pendiente (Fase 4)</p>}
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-purple-300/70">
              {c.plan === 'TRIAL' ? 'Trial vence' : 'Próximo cobro'}
            </p>
            {c.plan === 'TRIAL' ? (
              c.trialHasta ? (
                <>
                  <p className="text-2xl font-bold mt-1">{fmtDate(c.trialHasta)}</p>
                  {trialDias !== null && (
                    <p className={`text-xs mt-1 ${trialDias <= 5 ? 'text-amber-300' : 'text-purple-300/70'}`}>
                      {trialDias > 0 ? `${trialDias} días restantes` : `Vencido hace ${-trialDias} días`}
                    </p>
                  )}
                </>
              ) : <p className="text-2xl font-bold mt-1">—</p>
            ) : (
              <p className="text-sm text-purple-300/70 mt-2">Pasarela de pagos pendiente</p>
            )}
          </div>
        </div>
      </section>

      {/* RESUMEN DE PACIENTES */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-fuchsia-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Pacientes
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total" value={c.stats.pacientes} tone="fuchsia" />
          <Stat label="Con citas agendadas" value={c.stats.pacientesConAgenda} tone="emerald" />
          <Stat label="Sin citas" value={c.stats.pacientesSinAgenda} tone="slate" />
        </div>
        <p className="text-xs text-slate-500 mt-4">
          {c.stats.usuarios} usuario{c.stats.usuarios !== 1 ? 's' : ''} (doctor / staff / admin) · {c.stats.citas} cita{c.stats.citas !== 1 ? 's' : ''} totales agendadas
        </p>
      </section>

      {/* COBROS DE LA CLÍNICA (lo que ellos cobran a sus pacientes) */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Cobros a pacientes (actividad de la clínica)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total histórico" value={fmtCLP(c.stats.volumenCobrado)} tone="teal" />
          <Stat label="Últimos 90 días" value={fmtCLP(c.stats.volumen90d)} tone="emerald" />
          <Stat label="N° de cobros" value={c.stats.totalCobros} tone="slate" />
        </div>
      </section>

      {/* STORAGE */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          Almacenamiento
        </h2>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-2xl font-bold">{fmtBytes(c.storage.bytesUsados)}</p>
            <p className="text-xs text-slate-500 mt-1">de {fmtBytes(c.storage.cuotaBytes)} disponibles según plan {c.plan}</p>
          </div>
          <p className="text-sm text-slate-400">{storagePct.toFixed(1)}% usado</p>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all" style={{ width: `${Math.min(storagePct, 100)}%` }} />
        </div>
        <p className="text-xs text-slate-500 mt-3">
          📦 Módulo de archivos (radiografías y documentos) próximo en Fase 2. Hasta entonces 0 B usados.
        </p>
      </section>

      {/* DATOS DE LA CLÍNICA */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold mb-4">Datos de la clínica</h2>
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} />
            <Field label="Ciudad" value={form.ciudad} onChange={(v) => setForm({ ...form, ciudad: v })} />
            <Field label="Dirección" value={form.direccion} onChange={(v) => setForm({ ...form, direccion: v })} />
            <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Plan</label>
              <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
                <option value="TRIAL">TRIAL</option>
                <option value="BASICO">BASICO</option>
                <option value="PRO">PRO</option>
              </select>
            </div>
            <div className="col-span-full flex gap-2">
              <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 rounded-lg text-sm font-medium">
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              <button onClick={() => { setEditing(false); setForm({ nombre: c.nombre, ciudad: c.ciudad, direccion: c.direccion, telefono: c.telefono, email: c.email, plan: c.plan }) }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium">
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-sm">
            <Row label="Ciudad" value={c.ciudad || '—'} />
            <Row label="Dirección" value={c.direccion || '—'} />
            <Row label="Teléfono" value={c.telefono || '—'} />
            <Row label="Email" value={c.email || '—'} />
            <Row label="RUT" value={c.rut || '—'} />
            <Row label="Creada el" value={fmtDate(c.createdAt)} />
          </dl>
        )}
      </section>

      {c.adminInicial && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Administrador inicial</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-sm">
            <Row label="Nombre" value={c.adminInicial.name ?? '—'} />
            <Row label="Email" value={c.adminInicial.email ?? '—'} />
            <Row label="Rol" value={c.adminInicial.role} />
            <Row label="Registrado" value={fmtDate(c.adminInicial.createdAt)} />
          </dl>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  const tones: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    fuchsia: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300',
    teal:    'bg-teal-500/10 border-teal-500/30 text-teal-300',
    slate:   'bg-slate-800/50 border-slate-700 text-slate-300',
  }
  return (
    <div className={`rounded-xl border p-4 ${tones[tone] ?? tones.slate}`}>
      <p className="text-xs uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1 text-white">{value}</p>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-slate-200 mt-0.5">{value}</dd>
    </div>
  )
}
