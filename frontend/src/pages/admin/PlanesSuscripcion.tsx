import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'

interface Plan { id: string; nombre: string; descripcion: string | null; precioMensual: number; precioMensualUSD: number; maxProfesionales: number; destacado: boolean; activo: boolean; orden: number }
const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtUSD = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

export function AdminPlanes() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [form, setForm] = useState({ id: '', nombre: '', precioMensual: '', precioMensualUSD: '', maxProfesionales: '2' })
  const [msg, setMsg] = useState('')
  const cargar = () => adminService.planes().then((r) => setPlanes(r.planes as Plan[])).catch(() => {})
  useEffect(() => { cargar() }, [])

  async function crear() {
    try {
      await adminService.crearPlan({ id: form.id, nombre: form.nombre, precioMensual: Number(form.precioMensual), precioMensualUSD: Number(form.precioMensualUSD) || 0, maxProfesionales: Number(form.maxProfesionales) || 2 })
      setForm({ id: '', nombre: '', precioMensual: '', precioMensualUSD: '', maxProfesionales: '2' }); setMsg(''); cargar()
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') }
  }
  async function toggle(p: Plan) { await adminService.actualizarPlan(p.id, { activo: !p.activo }).catch(() => {}); cargar() }
  async function precio(p: Plan, v: number) { await adminService.actualizarPlan(p.id, { precioMensual: v }).catch(() => {}); cargar() }
  async function precioUSD(p: Plan, v: number) { await adminService.actualizarPlan(p.id, { precioMensualUSD: v }).catch(() => {}); cargar() }
  async function maxProf(p: Plan, v: number) { await adminService.actualizarPlan(p.id, { maxProfesionales: v }).catch(() => {}); cargar() }

  return (
    <div>
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Planes de suscripción</h1>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto mb-6">
        <table className="w-full text-sm min-w-[520px]">
          <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <th className="text-left px-6 py-3">Plan</th><th className="text-left px-6 py-3">Precio CLP</th><th className="text-left px-6 py-3">Precio USD</th><th className="text-left px-6 py-3">Profesionales</th><th className="text-left px-6 py-3">Estado</th><th className="px-6 py-3"></th>
          </tr></thead>
          <tbody className="divide-y divide-slate-800">
            {planes.map((p) => (
              <tr key={p.id} className="hover:bg-slate-800/40">
                <td className="px-6 py-3"><span className="text-white font-medium">{p.nombre}</span><span className="text-xs text-slate-500 font-mono ml-2">{p.id}</span></td>
                <td className="px-6 py-3">
                  <input defaultValue={p.precioMensual} onBlur={(e) => { const v = Number(e.target.value); if (v !== p.precioMensual && Number.isFinite(v)) precio(p, v) }}
                    className="w-28 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-sm" />
                  <span className="text-xs text-slate-500 ml-2">{fmtCLP(p.precioMensual)}</span>
                </td>
                <td className="px-6 py-3">
                  <input defaultValue={p.precioMensualUSD} type="number" min={0} step="0.01"
                    onBlur={(e) => { const v = Number(e.target.value); if (v !== p.precioMensualUSD && Number.isFinite(v) && v >= 0) precioUSD(p, v) }}
                    className="w-24 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-sm" />
                  <span className="text-xs text-slate-500 ml-2">{fmtUSD(p.precioMensualUSD)}</span>
                </td>
                <td className="px-6 py-3">
                  <input defaultValue={p.maxProfesionales} type="number" min={1}
                    onBlur={(e) => { const v = Number(e.target.value); if (v !== p.maxProfesionales && Number.isFinite(v) && v >= 1) maxProf(p, Math.round(v)) }}
                    className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-sm" />
                  <span className="text-xs text-slate-500 ml-2">c/agenda</span>
                </td>
                <td className="px-6 py-3">{p.activo ? <span className="text-emerald-400 text-xs">Activo</span> : <span className="text-slate-500 text-xs">Inactivo</span>}</td>
                <td className="px-6 py-3 text-right"><button onClick={() => toggle(p)} className="text-xs text-slate-400 hover:text-white">{p.activo ? 'Desactivar' : 'Activar'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <p className="text-sm font-semibold mb-3">Nuevo plan</p>
        <div className="flex flex-wrap gap-2">
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })} placeholder="CÓDIGO (ej PREMIUM)" className="flex-1 min-w-[140px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre comercial" className="flex-1 min-w-[140px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
          <input value={form.precioMensual} onChange={(e) => setForm({ ...form, precioMensual: e.target.value })} placeholder="Precio CLP" inputMode="numeric" className="flex-1 min-w-[120px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono" />
          <input value={form.precioMensualUSD} onChange={(e) => setForm({ ...form, precioMensualUSD: e.target.value })} placeholder="Precio USD" inputMode="decimal" className="flex-1 min-w-[120px] px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono" />
          <input value={form.maxProfesionales} onChange={(e) => setForm({ ...form, maxProfesionales: e.target.value })} placeholder="Máx. profesionales" inputMode="numeric" title="Usuarios con agenda incluidos" className="w-40 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono" />
          <button onClick={crear} disabled={!form.id || !form.nombre} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shrink-0">Crear</button>
        </div>
        {msg && <p className="text-rose-400 text-sm mt-2">{msg}</p>}
      </div>
    </div>
  )
}
