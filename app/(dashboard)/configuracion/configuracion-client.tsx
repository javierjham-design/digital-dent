'use client'

import { useState } from 'react'

interface Config {
  id: string
  clinica: string
  direccion: string
  telefono: string
  email: string
  ciudad: string
}

const WA_PREVIEW_NOMBRE  = 'Juan Pérez'
const WA_PREVIEW_FECHA   = 'martes 10 de junio a las 10:30 hrs'

export function ConfiguracionClient({ config: init }: { config: Config }) {
  const [form, setForm] = useState<Config>(init)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

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

  const previewMsg = `Hola ${WA_PREVIEW_NOMBRE}, te escribimos de *${form.clinica || 'Clínica'}* para confirmar tu cita el ${WA_PREVIEW_FECHA} en ${form.direccion || 'nuestra dirección'}${form.ciudad ? `, ${form.ciudad}` : ''}.`

  return (
    <div className="p-8 max-w-3xl space-y-8">
      {/* Header */}
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
          <p className="text-xs text-slate-500">Así se verá el mensaje que se enviará al paciente al confirmar una cita:</p>

          {/* Burbuja de chat simulada */}
          <div className="bg-slate-100 rounded-2xl p-4">
            <div className="flex justify-end">
              <div className="bg-emerald-500 text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-xs shadow text-sm leading-relaxed">
                {previewMsg}
              </div>
            </div>
            <p className="text-right text-xs text-slate-400 mt-1 pr-1">Digital-Dent</p>
          </div>
        </div>

        {/* Save */}
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
    </div>
  )
}
