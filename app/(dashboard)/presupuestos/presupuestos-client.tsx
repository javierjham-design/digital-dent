'use client'

import { useState } from 'react'
import { formatCLP, formatDate } from '@/lib/utils'

interface Item { prestacion: string; cantidad: number; subtotal: number }
interface Presupuesto { id: string; numero: number; estado: string; total: number; paciente: string; createdAt: string; items: Item[] }

const ESTADO_STYLES: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700',
  APROBADO: 'bg-emerald-100 text-emerald-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  COMPLETADO: 'bg-blue-100 text-blue-700',
}

export function PresupuestosClient({ presupuestos, pacientes, prestaciones }: { presupuestos: Presupuesto[]; pacientes: any[]; prestaciones: any[] }) {
  const [showModal, setShowModal] = useState(false)
  const [pacienteId, setPacienteId] = useState('')
  const [items, setItems] = useState<{ prestacionId: string; cantidad: number; precioUnitario: number; descuento: number }[]>([
    { prestacionId: '', cantidad: 1, precioUnitario: 0, descuento: 0 },
  ])
  const [saving, setSaving] = useState(false)

  function addItem() {
    setItems([...items, { prestacionId: '', cantidad: 1, precioUnitario: 0, descuento: 0 }])
  }

  function updateItem(i: number, field: string, value: any) {
    const updated = [...items]
    if (field === 'prestacionId') {
      const p = prestaciones.find((p: any) => p.id === value)
      updated[i] = { ...updated[i], prestacionId: value, precioUnitario: p?.precio ?? 0 }
    } else {
      updated[i] = { ...updated[i], [field]: value }
    }
    setItems(updated)
  }

  function removeItem(i: number) {
    setItems(items.filter((_, idx) => idx !== i))
  }

  const total = items.reduce((s, item) => {
    const subtotal = item.precioUnitario * item.cantidad * (1 - item.descuento / 100)
    return s + subtotal
  }, 0)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/presupuestos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pacienteId,
        items: items.map((item) => ({
          ...item,
          subtotal: item.precioUnitario * item.cantidad * (1 - item.descuento / 100),
        })),
        total,
      }),
    })
    setSaving(false)
    setShowModal(false)
    window.location.reload()
  }

  async function cambiarEstado(id: string, estado: string) {
    await fetch(`/api/presupuestos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    window.location.reload()
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Presupuestos</h1>
          <p className="text-slate-500 text-sm mt-1">{presupuestos.length} presupuesto{presupuestos.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuevo presupuesto
        </button>
      </div>

      <div className="space-y-4">
        {presupuestos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 text-center text-slate-400 text-sm">Sin presupuestos</div>
        ) : presupuestos.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-slate-900">Presupuesto #{p.numero}</h3>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ESTADO_STYLES[p.estado]}`}>{p.estado}</span>
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{p.paciente} · {formatDate(p.createdAt)}</p>
              </div>
              <p className="text-xl font-bold text-slate-900">{formatCLP(p.total)}</p>
            </div>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-1.5 text-xs text-slate-500 font-semibold">Prestación</th>
                  <th className="text-center py-1.5 text-xs text-slate-500 font-semibold">Cant.</th>
                  <th className="text-right py-1.5 text-xs text-slate-500 font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {p.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-1.5 text-slate-700">{item.prestacion}</td>
                    <td className="py-1.5 text-center text-slate-500">{item.cantidad}</td>
                    <td className="py-1.5 text-right font-medium text-slate-900">{formatCLP(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.estado === 'PENDIENTE' && (
              <div className="flex gap-2 border-t border-slate-100 pt-4">
                <button onClick={() => cambiarEstado(p.id, 'APROBADO')}
                  className="px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg">Aprobar</button>
                <button onClick={() => cambiarEstado(p.id, 'RECHAZADO')}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg">Rechazar</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo presupuesto</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Paciente *</label>
                <select required value={pacienteId} onChange={(e) => setPacienteId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="">Seleccionar paciente</option>
                  {pacientes.map((p: any) => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Prestaciones</label>
                  <button type="button" onClick={addItem} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">+ Agregar</button>
                </div>
                <div className="space-y-3">
                  {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        {i === 0 && <label className="block text-xs text-slate-500 mb-1">Prestación</label>}
                        <select value={item.prestacionId} onChange={(e) => updateItem(i, 'prestacionId', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                          <option value="">Seleccionar</option>
                          {prestaciones.map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <label className="block text-xs text-slate-500 mb-1">Cant.</label>}
                        <input type="number" min="1" value={item.cantidad} onChange={(e) => updateItem(i, 'cantidad', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      </div>
                      <div className="col-span-3">
                        {i === 0 && <label className="block text-xs text-slate-500 mb-1">Precio</label>}
                        <input type="number" min="0" value={item.precioUnitario} onChange={(e) => updateItem(i, 'precioUnitario', Number(e.target.value))}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      </div>
                      <div className="col-span-2">
                        {i === 0 && <label className="block text-xs text-slate-500 mb-1 opacity-0">.</label>}
                        <button type="button" onClick={() => removeItem(i)} className="w-full py-2 text-red-400 hover:text-red-600 text-sm">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center bg-slate-50 rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-slate-700">Total presupuesto</span>
                <span className="text-xl font-bold text-slate-900">{formatCLP(total)}</span>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving || !pacienteId}
                  className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">
                  {saving ? 'Guardando...' : 'Crear presupuesto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
