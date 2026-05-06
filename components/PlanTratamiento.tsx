'use client'

import { useState } from 'react'
import { OdontogramaSelector, type SeleccionDental } from './OdontogramaSelector'
import { formatCLP } from '@/lib/utils'
import { cn } from '@/lib/utils'

const ESTADO_STYLES: Record<string, { label: string; cls: string }> = {
  PLANIFICADO: { label: 'Planificado', cls: 'bg-slate-100 text-slate-600' },
  EN_PROGRESO: { label: 'En progreso', cls: 'bg-blue-100 text-blue-700' },
  COMPLETADO:  { label: 'Completado',  cls: 'bg-emerald-100 text-emerald-700' },
}

interface Tratamiento {
  id: string
  diente: number | null
  cara: string | null
  precio: number
  notas: string | null
  estado: string
  prestacion: { id: string; nombre: string; precio: number }
}

interface Prestacion {
  id: string
  nombre: string
  precio: number
  categoria: string | null
}

interface Props {
  pacienteId: string
  pacienteNombre: string
  fichaId?: string
  tratamientos: Tratamiento[]
  dientesExistentes?: { numero: number; estadoActual?: string }[]
  prestaciones: Prestacion[]
  onPresupuesto: (items: Tratamiento[]) => void
}

export function PlanTratamiento({
  pacienteId,
  pacienteNombre,
  fichaId,
  tratamientos: initialTratamientos,
  dientesExistentes = [],
  prestaciones,
  onPresupuesto,
}: Props) {
  const [tratamientos, setTratamientos] = useState<Tratamiento[]>(initialTratamientos)
  const [seleccion, setSeleccion] = useState<SeleccionDental>({ tipo: 'PIEZA', piezas: [] })
  const [prestacionId, setPrestacionId] = useState('')
  const [precio, setPrecio] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('TODOS')

  const seleccionValida = seleccion.piezas.length > 0 || !!seleccion.zona
  const prestacionSeleccionada = prestaciones.find((p) => p.id === prestacionId)

  function onPrestacionChange(id: string) {
    setPrestacionId(id)
    const p = prestaciones.find((p) => p.id === id)
    if (p) setPrecio(p.precio.toString())
  }

  async function agregarAccion() {
    if (!prestacionId || !seleccionValida) return
    setSaving(true)
    const res = await fetch('/api/tratamientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pacienteId,
        fichaId,
        prestacionId,
        piezas: seleccion.piezas,
        zona: seleccion.zona,
        precio: Number(precio),
        notas,
      }),
    })
    const nuevos: Tratamiento[] = await res.json()
    setTratamientos((prev) => [...prev, ...nuevos])
    setPrestacionId('')
    setPrecio('')
    setNotas('')
    setSeleccion({ tipo: 'PIEZA', piezas: [] })
    setSaving(false)
  }

  async function cambiarEstado(id: string, estado: string) {
    await fetch(`/api/tratamientos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    setTratamientos((prev) => prev.map((t) => t.id === id ? { ...t, estado } : t))
  }

  async function eliminar(id: string) {
    await fetch(`/api/tratamientos/${id}`, { method: 'DELETE' })
    setTratamientos((prev) => prev.filter((t) => t.id !== id))
  }

  const filtrados = tratamientos.filter((t) => filtroEstado === 'TODOS' || t.estado === filtroEstado)
  const total = filtrados.reduce((s, t) => s + t.precio, 0)
  const totalPlan = tratamientos.reduce((s, t) => s + t.precio, 0)

  function describePieza(t: Tratamiento) {
    if (t.diente) return `Pieza ${t.diente}`
    if (t.cara) return t.cara
    return 'General'
  }

  const categorias = Array.from(new Set(prestaciones.map((p) => p.categoria).filter(Boolean)))

  return (
    <div className="space-y-6">
      {/* Panel de agregar acción */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-teal-50 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Agregar acción clínica</h3>
            <p className="text-xs text-slate-500 mt-0.5">Selecciona la pieza o zona, luego la prestación</p>
          </div>
          {tratamientos.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-500">Total del plan</p>
              <p className="text-lg font-bold text-cyan-700">{formatCLP(totalPlan)}</p>
            </div>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Odontograma */}
          <div>
            <p className="text-sm font-medium text-slate-700 mb-3">
              1. Selecciona la pieza o zona a tratar
            </p>
            <OdontogramaSelector
              dientes={dientesExistentes}
              seleccion={seleccion}
              onChange={setSeleccion}
            />
          </div>

          {/* Formulario acción */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-700">
              2. Selecciona la acción clínica
            </p>

            {/* Prestación */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Prestación / Tratamiento *</label>
              <select
                value={prestacionId}
                onChange={(e) => onPrestacionChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 bg-white"
              >
                <option value="">— Seleccionar prestación —</option>
                {categorias.map((cat) => (
                  <optgroup key={cat} label={cat ?? ''}>
                    {prestaciones.filter((p) => p.categoria === cat).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} — {formatCLP(p.precio)}</option>
                    ))}
                  </optgroup>
                ))}
                {prestaciones.filter((p) => !p.categoria).map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            {/* Precio */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Precio (CLP)</label>
              <input
                type="number"
                min="0"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* Notas */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Observaciones (opcional)</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Notas clínicas sobre este tratamiento..."
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
              />
            </div>

            {/* Resumen antes de agregar */}
            {prestacionSeleccionada && seleccionValida && (
              <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-sm">
                <p className="font-medium text-cyan-800 mb-1">Resumen de la acción:</p>
                <p className="text-cyan-700">
                  <strong>{prestacionSeleccionada.nombre}</strong>
                  {seleccion.piezas.length > 0
                    ? ` — Pieza${seleccion.piezas.length > 1 ? 's' : ''} ${seleccion.piezas.join(', ')}`
                    : seleccion.zona ? ` — ${seleccion.zona}` : ''}
                </p>
                <p className="text-cyan-600 font-semibold mt-1">{formatCLP(Number(precio) || 0)}</p>
                {seleccion.piezas.length > 1 && (
                  <p className="text-xs text-cyan-500 mt-1">
                    Se crearán {seleccion.piezas.length} items ({formatCLP((Number(precio) || 0) * seleccion.piezas.length)} total)
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={agregarAccion}
              disabled={saving || !prestacionId || !seleccionValida || !precio}
              className="w-full flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors"
            >
              {saving ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Guardando...</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg> Agregar al plan</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabla del plan */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-slate-900">Plan de tratamiento</h3>
            <div className="flex gap-1">
              {['TODOS', 'PLANIFICADO', 'EN_PROGRESO', 'COMPLETADO'].map((e) => (
                <button
                  key={e}
                  onClick={() => setFiltroEstado(e)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    filtroEstado === e
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {e === 'TODOS' ? 'Todos' : ESTADO_STYLES[e]?.label}
                  <span className="ml-1 opacity-70">
                    ({e === 'TODOS' ? tratamientos.length : tratamientos.filter((t) => t.estado === e).length})
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tratamientos.length > 0 && (
              <>
                <button
                  onClick={() => window.open(`/print/plan?pacienteId=${pacienteId}`, '_blank')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                  Imprimir plan
                </button>
                <button
                  onClick={() => onPresupuesto(tratamientos.filter((t) => t.estado !== 'COMPLETADO'))}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  Generar presupuesto
                </button>
              </>
            )}
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            {tratamientos.length === 0
              ? 'El plan de tratamiento está vacío. Agrega acciones clínicas arriba.'
              : 'No hay tratamientos con este estado.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pieza / Zona</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Acción clínica</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase hidden md:table-cell">Observaciones</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Precio</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtrados.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 bg-cyan-50 text-cyan-700 border border-cyan-100 px-2.5 py-1 rounded-lg text-xs font-semibold">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
                          {describePieza(t)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{t.prestacion.nombre}</td>
                      <td className="px-4 py-3 text-slate-500 hidden md:table-cell max-w-[200px] truncate">{t.notas || '—'}</td>
                      <td className="px-4 py-3">
                        <select
                          value={t.estado}
                          onChange={(e) => cambiarEstado(t.id, e.target.value)}
                          className={cn(
                            'text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-500',
                            ESTADO_STYLES[t.estado]?.cls
                          )}
                        >
                          {Object.entries(ESTADO_STYLES).map(([val, { label }]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCLP(t.precio)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => eliminar(t.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Total */}
            <div className="px-4 py-4 border-t border-slate-100 flex justify-end items-center gap-4 bg-slate-50">
              <span className="text-sm text-slate-500">
                {filtrados.length} acción{filtrados.length !== 1 ? 'es' : ''}
              </span>
              <span className="text-lg font-bold text-slate-900">{formatCLP(total)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
