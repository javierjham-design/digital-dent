'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Clinica = {
  id: string; slug: string; nombre: string
  rut: string | null; direccion: string; ciudad: string
  telefono: string; email: string
  plan: string; activo: boolean
  trialHasta: string | null; createdAt: string; updatedAt: string
  counts: { users: number; pacientes: number; citas: number; presupuestos: number; cobros: number; prestaciones: number }
  volumenCobrado: number
  totalCobros: number
  adminInicial: { name: string | null; email: string; role: string; createdAt: string } | null
}

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function ClinicaDetailClient({ clinica: initial }: { clinica: Clinica }) {
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

  const tono = c.activo ? 'emerald' : 'red'

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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
        {[
          { l: 'Usuarios', v: c.counts.users },
          { l: 'Pacientes', v: c.counts.pacientes },
          { l: 'Citas', v: c.counts.citas },
          { l: 'Presupuestos', v: c.counts.presupuestos },
          { l: 'Cobros', v: c.counts.cobros },
          { l: 'Prestaciones', v: c.counts.prestaciones },
        ].map((k) => (
          <div key={k.l} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{k.l}</p>
            <p className="text-2xl font-bold mt-1">{k.v}</p>
          </div>
        ))}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-2 md:col-span-3">
          <p className="text-xs uppercase tracking-wider text-slate-500">Volumen cobrado histórico</p>
          <p className="text-2xl font-bold mt-1 text-teal-300">{fmtCLP(c.volumenCobrado)}</p>
          <p className="text-xs text-slate-500 mt-1">{c.totalCobros} cobros registrados</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
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
            <Row label="Última actualización" value={fmtDate(c.updatedAt)} />
            <Row label="Trial vence" value={c.trialHasta ? fmtDate(c.trialHasta) : '—'} />
          </dl>
        )}
      </div>

      {c.adminInicial && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Administrador inicial</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 text-sm">
            <Row label="Nombre" value={c.adminInicial.name ?? '—'} />
            <Row label="Email" value={c.adminInicial.email} />
            <Row label="Rol" value={c.adminInicial.role} />
            <Row label="Registrado" value={fmtDate(c.adminInicial.createdAt)} />
          </dl>
        </div>
      )}
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
