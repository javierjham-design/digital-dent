'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Plan = {
  id: string
  nombre: string
  descripcion: string | null
  precioMensual: number
  precioAnual: number | null
  caracteristicas: string[]
  destacado: boolean
  orden: number
  activo: boolean
  createdAt: string
  updatedAt: string
  clinicasUsando: number
}

type FormState = {
  id: string
  nombre: string
  descripcion: string
  precioMensual: string
  precioAnual: string
  caracteristicasText: string // textarea separado por saltos de línea
  destacado: boolean
  orden: string
  activo: boolean
}

const EMPTY_FORM: FormState = {
  id: '', nombre: '', descripcion: '',
  precioMensual: '0', precioAnual: '',
  caracteristicasText: '',
  destacado: false, orden: '0', activo: true,
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export function PlanesClient({ planes }: { planes: Plan[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<Plan | null>(null) // null = creando, plan = editando
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setErr('')
    setModalOpen(true)
  }

  function openEdit(p: Plan) {
    setEditing(p)
    setForm({
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion ?? '',
      precioMensual: String(p.precioMensual),
      precioAnual: p.precioAnual != null ? String(p.precioAnual) : '',
      caracteristicasText: p.caracteristicas.join('\n'),
      destacado: p.destacado,
      orden: String(p.orden),
      activo: p.activo,
    })
    setErr('')
    setModalOpen(true)
  }

  async function submit() {
    setErr(''); setSaving(true)
    try {
      const caracteristicas = form.caracteristicasText
        .split('\n').map((s) => s.trim()).filter(Boolean)

      const body: Record<string, unknown> = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        precioMensual: Number(form.precioMensual),
        precioAnual: form.precioAnual ? Number(form.precioAnual) : null,
        caracteristicas,
        destacado: form.destacado,
        orden: Number(form.orden) || 0,
        activo: form.activo,
      }

      let res: Response
      if (editing) {
        res = await fetch(`/api/admin/planes-suscripcion/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        body.id = form.id
        res = await fetch('/api/admin/planes-suscripcion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErr(j.error ?? `Error ${res.status}`)
        return
      }
      setModalOpen(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function eliminar(p: Plan) {
    if (!confirm(`¿Eliminar el plan "${p.nombre}" (${p.id})? Esta acción es definitiva.`)) return
    const res = await fetch(`/api/admin/planes-suscripcion/${p.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? `Error ${res.status}`)
      return
    }
    router.refresh()
  }

  async function toggleActivo(p: Plan) {
    const res = await fetch(`/api/admin/planes-suscripcion/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !p.activo }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? `Error ${res.status}`)
      return
    }
    router.refresh()
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Planes de suscripción</h1>
          <p className="text-slate-400 mt-1 text-sm">Catálogo de planes que se ofrece a las clínicas. Cambios surten efecto inmediato.</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium text-white flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo plan
        </button>
      </div>

      {/* Grilla de planes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {planes.length === 0 && (
          <p className="text-slate-500 col-span-full text-center py-12">No hay planes. Crea el primero.</p>
        )}
        {planes.map((p) => (
          <div
            key={p.id}
            className={`relative rounded-2xl p-6 border ${
              p.destacado
                ? 'bg-gradient-to-br from-purple-500/15 to-fuchsia-500/15 border-purple-500/40'
                : 'bg-slate-900 border-slate-800'
            } ${!p.activo ? 'opacity-60' : ''}`}
          >
            {p.destacado && (
              <span className="absolute -top-2 left-6 px-2 py-0.5 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
                Más popular
              </span>
            )}
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs font-mono text-slate-500">{p.id}</p>
                <h3 className="text-lg font-bold text-white">{p.nombre}</h3>
              </div>
              <div className="flex gap-1">
                {!p.activo && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-700 text-slate-300">Inactivo</span>
                )}
              </div>
            </div>
            {p.descripcion && <p className="text-sm text-slate-400 mb-3">{p.descripcion}</p>}
            <div className="mb-4">
              <p className="text-2xl font-bold text-white">{fmtCLP(p.precioMensual)}<span className="text-sm font-normal text-slate-400">/mes</span></p>
              {p.precioAnual != null && (
                <p className="text-xs text-slate-500">{fmtCLP(p.precioAnual)}/año</p>
              )}
            </div>

            {p.caracteristicas.length > 0 && (
              <ul className="space-y-1 mb-4 text-sm text-slate-300">
                {p.caracteristicas.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
              <span>Orden: {p.orden}</span>
              <span>{p.clinicasUsando} clínica{p.clinicasUsando !== 1 ? 's' : ''}</span>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => openEdit(p)}
                className="flex-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
              >
                Editar
              </button>
              <button
                onClick={() => toggleActivo(p)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                {p.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button
                onClick={() => eliminar(p)}
                disabled={p.clinicasUsando > 0}
                title={p.clinicasUsando > 0 ? 'No se puede eliminar: hay clínicas usando este plan' : ''}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-rose-300 rounded-lg text-xs font-medium"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setModalOpen(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">{editing ? `Editar plan ${editing.id}` : 'Nuevo plan'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {!editing && (
                <label className="block">
                  <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
                    Código <span className="text-slate-600">(ej: ENTERPRISE)</span>
                  </span>
                  <input
                    value={form.id}
                    onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })}
                    placeholder="MAYÚSCULAS, sin espacios"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono uppercase focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </label>
              )}

              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Nombre comercial</span>
                <input
                  value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>

              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Descripción corta</span>
                <input
                  value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Precio mensual (CLP)</span>
                  <input
                    value={form.precioMensual} onChange={(e) => setForm({ ...form, precioMensual: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Precio anual (opcional)</span>
                  <input
                    value={form.precioAnual} onChange={(e) => setForm({ ...form, precioAnual: e.target.value })}
                    placeholder="Vacío = mensual × 12"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
                  Características <span className="text-slate-600">(una por línea)</span>
                </span>
                <textarea
                  rows={6}
                  value={form.caracteristicasText}
                  onChange={(e) => setForm({ ...form, caracteristicasText: e.target.value })}
                  placeholder="Pacientes ilimitados&#10;Agenda completa&#10;Soporte prioritario"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Orden de visualización</span>
                  <input
                    value={form.orden} onChange={(e) => setForm({ ...form, orden: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </label>
                <div className="flex flex-col justify-end gap-2">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox" checked={form.destacado}
                      onChange={(e) => setForm({ ...form, destacado: e.target.checked })}
                      className="w-4 h-4 rounded text-purple-600"
                    />
                    Más popular
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="checkbox" checked={form.activo}
                      onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600"
                    />
                    Activo
                  </label>
                </div>
              </div>

              {err && <p className="text-rose-300 text-sm">{err}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={submit} disabled={saving}
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 rounded-lg text-sm font-medium text-white"
                >
                  {saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Crear plan')}
                </button>
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium text-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
