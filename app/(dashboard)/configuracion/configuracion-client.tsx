'use client'

import { useState } from 'react'

interface Config {
  id: string
  clinica: string
  direccion: string
  telefono: string
  email: string
  ciudad: string
  mensajeWA: string
}

interface MedioPago {
  id: string
  nombre: string
  comision: number
  activo: boolean
}

const WA_PREVIEW_NOMBRE = 'Juan'
const WA_PREVIEW_FECHA  = 'martes 10 de junio a las 10:30 hrs'

const DEFAULT_MENSAJE = 'Hola {nombre}, te escribimos de *{clinica}* para confirmar tu cita el {fecha} en {direccion}.'

export function ConfiguracionClient({
  config: init,
  mediosPago: initMedios,
}: {
  config: Config
  mediosPago: MedioPago[]
}) {
  const [form,    setForm]    = useState<Config>(init)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const [medios,      setMedios]      = useState<MedioPago[]>(initMedios)
  const [showMPModal, setShowMPModal] = useState(false)
  const [editMP,      setEditMP]      = useState<MedioPago | null>(null)
  const [mpForm,      setMpForm]      = useState({ nombre: '', comision: '0' })
  const [savingMP,    setSavingMP]    = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function openNewMP() {
    setEditMP(null)
    setMpForm({ nombre: '', comision: '0' })
    setShowMPModal(true)
  }

  function openEditMP(m: MedioPago) {
    setEditMP(m)
    setMpForm({ nombre: m.nombre, comision: String(m.comision) })
    setShowMPModal(true)
  }

  async function saveMP(e: React.FormEvent) {
    e.preventDefault()
    setSavingMP(true)
    if (editMP) {
      const res = await fetch(`/api/medios-pago/${editMP.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: mpForm.nombre, comision: Number(mpForm.comision) }),
      })
      const updated = await res.json()
      setMedios(p => p.map(m => m.id === updated.id ? updated : m))
    } else {
      const res = await fetch('/api/medios-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: mpForm.nombre, comision: Number(mpForm.comision) }),
      })
      const created = await res.json()
      setMedios(p => [...p, created])
    }
    setSavingMP(false)
    setShowMPModal(false)
  }

  async function toggleMP(m: MedioPago) {
    const res = await fetch(`/api/medios-pago/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !m.activo }),
    })
    const updated = await res.json()
    setMedios(p => p.map(x => x.id === updated.id ? updated : x))
  }

  const lugar      = [form.direccion, form.ciudad].filter(Boolean).join(', ') || 'nuestra dirección'
  const previewMsg = (form.mensajeWA || DEFAULT_MENSAJE)
    .replace(/{nombre}/g,    WA_PREVIEW_NOMBRE)
    .replace(/{clinica}/g,   form.clinica || 'Clínica')
    .replace(/{fecha}/g,     WA_PREVIEW_FECHA)
    .replace(/{direccion}/g, lugar)

  return (
    <div className="p-8 max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-0.5">Datos de la clínica usados en confirmaciones y documentos</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Datos clínica */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            Datos de la clínica
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la clínica *</label>
              <input required value={form.clinica}
                onChange={e => setForm(f => ({ ...f, clinica: e.target.value }))}
                placeholder="Digital-Dent"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Dirección</label>
              <input value={form.direccion}
                onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                placeholder="Av. Alemana 1234, Of. 201"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
              <input value={form.ciudad}
                onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))}
                placeholder="Temuco"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono clínica</label>
              <input value={form.telefono}
                onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                placeholder="+56 45 123 4567"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email clínica</label>
              <input type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="contacto@digitaldent.cl"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
          </div>
        </div>

        {/* Preview mensaje WhatsApp */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2">
            <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Previsualización mensaje WhatsApp
          </h2>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mensaje de confirmación</label>
            <textarea
              rows={3}
              value={form.mensajeWA}
              onChange={e => setForm(f => ({ ...f, mensajeWA: e.target.value }))}
              placeholder={DEFAULT_MENSAJE}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-slate-400">Variables disponibles:</span>
              {['{nombre}', '{clinica}', '{fecha}', '{direccion}'].map(v => (
                <button key={v} type="button"
                  onClick={() => setForm(f => ({ ...f, mensajeWA: (f.mensajeWA || DEFAULT_MENSAJE) + v }))}
                  className="text-xs font-mono bg-slate-100 hover:bg-cyan-100 text-slate-600 hover:text-cyan-700 px-2 py-0.5 rounded border border-slate-200 transition-colors">
                  {v}
                </button>
              ))}
              <button type="button"
                onClick={() => setForm(f => ({ ...f, mensajeWA: DEFAULT_MENSAJE }))}
                className="text-xs text-slate-400 hover:text-slate-600 ml-2 underline">
                Restaurar por defecto
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 -mt-1">Vista previa con datos de ejemplo:</p>
          <div className="bg-slate-100 rounded-2xl p-4">
            <div className="flex justify-end">
              <div className="bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-xs shadow text-sm leading-relaxed whitespace-pre-wrap">
                {previewMsg}
              </div>
            </div>
            <p className="text-right text-xs text-slate-400 mt-1 pr-1">Digital-Dent</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {saved && (
            <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Configuración guardada
            </span>
          )}
          <div className="ml-auto">
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm">
              {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      </form>

      {/* Medios de pago */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              Medios de pago
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Configura los métodos de pago disponibles y sus comisiones</p>
          </div>
          <button onClick={openNewMP}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-600 border border-cyan-200 bg-cyan-50 hover:bg-cyan-100 rounded-lg transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Agregar
          </button>
        </div>

        {medios.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No hay medios de pago configurados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Nombre</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Comisión</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {medios.map(m => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-3.5 font-medium text-slate-900">{m.nombre}</td>
                  <td className="px-6 py-3.5 text-slate-600">
                    {m.comision === 0 ? (
                      <span className="text-slate-400">Sin comisión</span>
                    ) : (
                      <span className="font-mono">{m.comision}%</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${m.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {m.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all justify-end">
                      <button onClick={() => openEditMP(m)}
                        className="p-1.5 text-slate-400 hover:text-cyan-600 rounded-lg hover:bg-cyan-50 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                      </button>
                      <button onClick={() => toggleMP(m)}
                        className={`p-1.5 rounded-lg transition-colors ${m.activo ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {m.activo
                            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
                            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>}
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal medios de pago */}
      {showMPModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-slate-900">{editMP ? 'Editar medio de pago' : 'Nuevo medio de pago'}</h2>
              <button onClick={() => setShowMPModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveMP} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                <input required value={mpForm.nombre}
                  onChange={e => setMpForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ej: Efectivo, Débito, Transferencia…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comisión (%)</label>
                <input type="number" min="0" max="100" step="0.01" value={mpForm.comision}
                  onChange={e => setMpForm(f => ({ ...f, comision: e.target.value }))}
                  placeholder="0"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <p className="text-xs text-slate-400 mt-1">Ingresa 0 si no tiene comisión. Ej: 1.5 = 1.5%</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowMPModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="submit" disabled={savingMP}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">
                  {savingMP ? 'Guardando…' : editMP ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
