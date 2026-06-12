'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from '@/components/ui/Toaster'

// ─────────────────────────────────────────────────────────────────────────────
//  Paneles del detalle de clínica (super-admin):
//   - ExtrasPanel: cargos recurrentes que se suman al plan (ej: WhatsApp).
//   - WhatsAppPanel: configuración Twilio del servicio de confirmaciones.
// ─────────────────────────────────────────────────────────────────────────────

export type Extra = {
  id: string
  codigo: string
  nombre: string
  montoMensual: number
  activo: boolean
  notas: string | null
}

export type WhatsAppConfig = {
  waEnabled: boolean
  waTwilioSid: string | null
  waNumero: string | null
  waTemplateSid: string | null
  waHorasAntes: number
  tokenConfigurado: boolean
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

// ─── Panel de extras ─────────────────────────────────────────────────────────

export function ExtrasPanel({ clinicaId, extras }: { clinicaId: string; extras: Extra[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nombre: '', montoStr: '', codigo: 'WHATSAPP', notas: '' })

  const totalActivo = extras.filter((e) => e.activo).reduce((s, e) => s + e.montoMensual, 0)

  async function crear() {
    const monto = Number(form.montoStr)
    if (!form.nombre.trim()) { toast.error('Ingresa un nombre para el extra.'); return }
    if (!Number.isFinite(monto) || monto < 0) { toast.error('Monto mensual inválido.'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/clinicas/${clinicaId}/extras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: form.nombre.trim(), montoMensual: monto, codigo: form.codigo, notas: form.notas || undefined }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? `Error ${res.status}`)
        return
      }
      toast.success('Extra agregado')
      setForm({ nombre: '', montoStr: '', codigo: 'WHATSAPP', notas: '' })
      setShowForm(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function toggleActivo(e: Extra) {
    const res = await fetch(`/api/admin/clinicas/${clinicaId}/extras/${e.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !e.activo }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? `Error ${res.status}`)
      return
    }
    toast.success(e.activo ? 'Extra pausado (deja de facturarse)' : 'Extra reactivado')
    router.refresh()
  }

  async function eliminar(e: Extra) {
    if (!confirm(`¿Eliminar el extra "${e.nombre}"? Esta acción no se puede deshacer.`)) return
    const res = await fetch(`/api/admin/clinicas/${clinicaId}/extras/${e.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(j.error ?? `Error ${res.status}`)
      return
    }
    toast.success('Extra eliminado')
    router.refresh()
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Servicios extra (facturación adicional)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Se suman al plan en el MRR y en el monto sugerido al registrar pagos.
            {totalActivo > 0 && <span className="text-amber-300 font-medium"> Total extras activos: {fmtCLP(totalActivo)}/mes.</span>}
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-lg text-xs font-medium">
          {showForm ? 'Cerrar' : '+ Agregar extra'}
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mb-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Nombre</span>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="Confirmaciones WhatsApp"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Monto mensual (CLP)</span>
            <input value={form.montoStr} onChange={(e) => setForm({ ...form, montoStr: e.target.value })}
              placeholder="15000"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Tipo</span>
            <select value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="WHATSAPP">WhatsApp</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Notas <span className="text-slate-600">(opcional)</span></span>
            <input value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <div className="md:col-span-2">
            <button onClick={crear} disabled={saving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-lg text-sm font-medium">
              {saving ? 'Guardando…' : 'Agregar extra'}
            </button>
          </div>
        </div>
      )}

      {extras.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">Sin servicios extra contratados.</p>
      ) : (
        <div className="divide-y divide-slate-800">
          {extras.map((e) => (
            <div key={e.id} className="py-3 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="text-sm font-medium text-white flex items-center gap-2">
                  {e.nombre}
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400">{e.codigo}</span>
                  {!e.activo && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-700 text-slate-300">PAUSADO</span>}
                </p>
                {e.notas && <p className="text-xs text-slate-500 mt-0.5">{e.notas}</p>}
              </div>
              <p className={`font-mono text-sm ${e.activo ? 'text-amber-300' : 'text-slate-500 line-through'}`}>
                {fmtCLP(e.montoMensual)}/mes
              </p>
              <div className="flex gap-2">
                <button onClick={() => toggleActivo(e)}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800">
                  {e.activo ? 'Pausar' : 'Reactivar'}
                </button>
                <button onClick={() => eliminar(e)}
                  className="px-2.5 py-1 text-xs rounded-lg text-rose-300/80 hover:text-rose-300 hover:bg-rose-500/10">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Panel de configuración WhatsApp (Twilio) ───────────────────────────────

export function WhatsAppPanel({ clinicaId, config }: { clinicaId: string; config: WhatsAppConfig }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    waEnabled: config.waEnabled,
    waTwilioSid: config.waTwilioSid ?? '',
    waTwilioToken: '',
    waNumero: config.waNumero ?? '',
    waTemplateSid: config.waTemplateSid ?? '',
    waHorasAntes: config.waHorasAntes,
  })

  async function guardar() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/clinicas/${clinicaId}/whatsapp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j.error ?? `Error ${res.status}`)
        return
      }
      toast.success('Configuración de WhatsApp guardada')
      setEditing(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  async function enviarAhora() {
    if (!confirm('¿Forzar el envío de recordatorios pendientes AHORA para todas las clínicas habilitadas?')) return
    const res = await fetch('/api/whatsapp/recordatorios', { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast.error(j.error ?? `Error ${res.status}`)
      return
    }
    toast.success(`Recordatorios enviados: ${j.enviados ?? 0}${j.errores?.length ? ` · errores: ${j.errores.length}` : ''}`)
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-300" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Confirmaciones por WhatsApp (Twilio)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Envío automático de recordatorios con botones Confirmar / Reagendar / Cancelar.
            La respuesta del paciente actualiza la cita sola.
          </p>
        </div>
        <div className="flex gap-2">
          {config.waEnabled && (
            <button onClick={enviarAhora}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium">
              Enviar pendientes ahora
            </button>
          )}
          <button onClick={() => setEditing((v) => !v)}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 rounded-lg text-xs font-medium">
            {editing ? 'Cerrar' : 'Configurar'}
          </button>
        </div>
      </div>

      {/* Estado actual */}
      <div className="flex items-center gap-3 flex-wrap text-sm mb-2">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${config.waEnabled
          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
          : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
          {config.waEnabled ? 'Servicio ACTIVO' : 'Servicio desactivado'}
        </span>
        {config.waNumero && <span className="text-slate-400 font-mono text-xs">Emisor: {config.waNumero}</span>}
        {config.waEnabled && <span className="text-slate-500 text-xs">Recordatorio {config.waHorasAntes} h antes de la cita</span>}
        {!config.tokenConfigurado && <span className="text-amber-300 text-xs">⚠ Falta el auth token de Twilio</span>}
      </div>

      {editing && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 mt-3 grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2 md:col-span-2 cursor-pointer">
            <input type="checkbox" checked={form.waEnabled}
              onChange={(e) => setForm({ ...form, waEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-slate-600 bg-slate-800" />
            <span className="text-sm text-white font-medium">Servicio habilitado</span>
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Twilio Account SID</span>
            <input value={form.waTwilioSid} onChange={(e) => setForm({ ...form, waTwilioSid: e.target.value })}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">
              Auth Token {config.tokenConfigurado && <span className="text-emerald-400">(ya configurado — dejar vacío para no cambiarlo)</span>}
            </span>
            <input type="password" value={form.waTwilioToken} onChange={(e) => setForm({ ...form, waTwilioToken: e.target.value })}
              placeholder={config.tokenConfigurado ? '••••••••••••' : 'Auth token de Twilio'}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Número emisor (E.164)</span>
            <input value={form.waNumero} onChange={(e) => setForm({ ...form, waNumero: e.target.value })}
              placeholder="+56912345678"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Template Content SID</span>
            <input value={form.waTemplateSid} onChange={(e) => setForm({ ...form, waTemplateSid: e.target.value })}
              placeholder="HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wider text-slate-500 mb-1">Horas antes de la cita</span>
            <input type="number" min={1} max={168} value={form.waHorasAntes}
              onChange={(e) => setForm({ ...form, waHorasAntes: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </label>
          <div className="md:col-span-2 space-y-2">
            <p className="text-xs text-slate-500">
              La plantilla en Twilio debe usar las variables: {'{{1}}'} nombre del paciente · {'{{2}}'} clínica · {'{{3}}'} fecha · {'{{4}}'} hora,
              con botones de respuesta rápida <span className="text-slate-300">Confirmar</span>, <span className="text-slate-300">Reagendar</span> y <span className="text-slate-300">Cancelar</span>.
              Webhook de mensajes entrantes en Twilio: <span className="font-mono text-slate-300">https://app.clariva.cl/api/whatsapp/webhook</span>
            </p>
            <button onClick={guardar} disabled={saving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg text-sm font-medium">
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
