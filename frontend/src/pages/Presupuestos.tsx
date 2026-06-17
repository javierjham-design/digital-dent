import { useEffect, useMemo, useState } from 'react'
import type { PacienteDTO, PrestacionDTO } from '@shared/types'
import { presupuestosService } from '@/services/clinico.service'
import { prestacionesService } from '@/services/catalogo.service'
import { pacientesService } from '@/services/clinica.service'
import { ApiError } from '@/services/api'

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtFecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

interface Presupuesto {
  id: string; numero: number; total: number; estado: string; pacienteId: string
  notas: string | null; vigencia: string | null; createdAt: string; _count?: { items: number }
}
const ESTADOS = ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'COMPLETADO']
const ESTADO_TONE: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-700', APROBADO: 'bg-emerald-100 text-emerald-700',
  RECHAZADO: 'bg-rose-100 text-rose-700', COMPLETADO: 'bg-cyan-100 text-cyan-700',
}

export function Presupuestos() {
  const [lista, setLista] = useState<Presupuesto[]>([])
  const [pacientes, setPacientes] = useState<PacienteDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [crear, setCrear] = useState(false)

  const nombrePaciente = useMemo(() => {
    const m = new Map(pacientes.map((p) => [p.id, `${p.nombre} ${p.apellido}`]))
    return (id: string) => m.get(id) ?? '—'
  }, [pacientes])

  function cargar() {
    setCargando(true)
    Promise.all([
      presupuestosService.listar().then((r) => setLista(r as Presupuesto[])),
      pacientesService.listar().then(setPacientes),
    ]).finally(() => setCargando(false))
  }
  useEffect(() => { cargar() }, [])

  async function cambiarEstado(p: Presupuesto, estado: string) {
    setLista((xs) => xs.map((x) => (x.id === p.id ? { ...x, estado } : x)))
    await presupuestosService.actualizar(p.id, { estado }).catch(() => cargar())
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Presupuestos</h1>
        <button onClick={() => setCrear(true)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">+ Nuevo presupuesto</button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {cargando ? <p className="px-6 py-10 text-center text-slate-400 text-sm">Cargando…</p>
          : lista.length === 0 ? <p className="px-6 py-10 text-center text-slate-400 text-sm">Aún no hay presupuestos.</p>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400">
                <th className="text-left px-5 py-3">Nº</th><th className="text-left px-5 py-3">Paciente</th>
                <th className="text-center px-5 py-3">Ítems</th><th className="text-right px-5 py-3">Total</th>
                <th className="text-left px-5 py-3">Estado</th><th className="text-right px-5 py-3">Fecha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lista.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-slate-500">#{p.numero}</td>
                    <td className="px-5 py-3 text-slate-800">{nombrePaciente(p.pacienteId)}</td>
                    <td className="px-5 py-3 text-center text-slate-500">{p._count?.items ?? '—'}</td>
                    <td className="px-5 py-3 text-right font-medium text-slate-800">{fmtCLP(p.total)}</td>
                    <td className="px-5 py-3">
                      <select value={p.estado} onChange={(e) => cambiarEstado(p, e.target.value)}
                        className={`text-xs font-medium rounded-full px-2 py-1 border-0 focus:ring-2 focus:ring-cyan-500 ${ESTADO_TONE[p.estado] ?? 'bg-slate-100 text-slate-600'}`}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-400 text-xs whitespace-nowrap">{fmtFecha(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {crear && <CrearPresupuestoModal pacientes={pacientes} onClose={() => setCrear(false)} onCreado={() => { setCrear(false); cargar() }} />}
    </div>
  )
}

interface ItemForm { prestacionId: string; nombre: string; cantidad: number; precioUnitario: number; descuento: number }

function CrearPresupuestoModal({ pacientes, onClose, onCreado }: { pacientes: PacienteDTO[]; onClose: () => void; onCreado: () => void }) {
  const [pacienteId, setPacienteId] = useState('')
  const [prestaciones, setPrestaciones] = useState<PrestacionDTO[]>([])
  const [items, setItems] = useState<ItemForm[]>([])
  const [sel, setSel] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { prestacionesService.listar().then((ps) => setPrestaciones(ps.filter((p) => p.activo))).catch(() => {}) }, [])

  const subtotal = (it: ItemForm) => Math.max(it.cantidad * it.precioUnitario - it.descuento, 0)
  const total = items.reduce((s, it) => s + subtotal(it), 0)

  function agregar() {
    const p = prestaciones.find((x) => x.id === sel)
    if (!p) return
    setItems((xs) => [...xs, { prestacionId: p.id, nombre: p.nombre, cantidad: 1, precioUnitario: p.precio, descuento: 0 }])
    setSel('')
  }
  function set(i: number, patch: Partial<ItemForm>) { setItems((xs) => xs.map((it, idx) => (idx === i ? { ...it, ...patch } : it))) }
  function quitar(i: number) { setItems((xs) => xs.filter((_, idx) => idx !== i)) }

  async function guardar() {
    setGuardando(true); setError('')
    try {
      await presupuestosService.crear({
        pacienteId, total,
        items: items.map((it) => ({ prestacionId: it.prestacionId, cantidad: it.cantidad, precioUnitario: it.precioUnitario, descuento: it.descuento, subtotal: subtotal(it) })),
      })
      onCreado()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo crear el presupuesto') }
    finally { setGuardando(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Nuevo presupuesto</h2>

        <label className="block mb-4">
          <span className="block text-sm font-medium text-slate-700 mb-1">Paciente</span>
          <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Selecciona un paciente…</option>
            {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}{p.rut ? ` · ${p.rut}` : ''}</option>)}
          </select>
        </label>

        <div className="flex items-end gap-2 mb-3">
          <label className="flex-1">
            <span className="block text-sm font-medium text-slate-700 mb-1">Agregar prestación</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
              <option value="">Selecciona…</option>
              {prestaciones.map((p) => <option key={p.id} value={p.id}>{p.nombre} — {fmtCLP(p.precio)}</option>)}
            </select>
          </label>
          <button onClick={agregar} disabled={!sel} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white text-sm font-semibold rounded-xl">Agregar</button>
        </div>

        {items.length > 0 && (
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
                <th className="text-left px-3 py-2">Prestación</th><th className="px-2 py-2 w-16">Cant.</th>
                <th className="px-2 py-2 w-28">Precio</th><th className="px-2 py-2 w-28">Desc.</th>
                <th className="text-right px-3 py-2 w-28">Subtotal</th><th className="w-8"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-slate-700">{it.nombre}</td>
                    <td className="px-2 py-2"><input type="number" min={1} value={it.cantidad} onChange={(e) => set(i, { cantidad: Math.max(1, Number(e.target.value) || 1) })} className="w-14 px-1 py-1 border border-slate-200 rounded text-center" /></td>
                    <td className="px-2 py-2"><input type="number" min={0} value={it.precioUnitario} onChange={(e) => set(i, { precioUnitario: Math.max(0, Number(e.target.value) || 0) })} className="w-24 px-1 py-1 border border-slate-200 rounded text-right font-mono" /></td>
                    <td className="px-2 py-2"><input type="number" min={0} value={it.descuento} onChange={(e) => set(i, { descuento: Math.max(0, Number(e.target.value) || 0) })} className="w-24 px-1 py-1 border border-slate-200 rounded text-right font-mono" /></td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">{fmtCLP(subtotal(it))}</td>
                    <td className="px-2 py-2 text-center"><button onClick={() => quitar(i)} className="text-rose-400 hover:text-rose-600">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mb-4">
          <span className="text-sm text-slate-500">Total</span>
          <span className="text-xl font-bold text-slate-900">{fmtCLP(total)}</span>
        </div>

        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando || !pacienteId || items.length === 0}
            className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm">
            {guardando ? 'Guardando…' : 'Crear presupuesto'}
          </button>
        </div>
      </div>
    </div>
  )
}
