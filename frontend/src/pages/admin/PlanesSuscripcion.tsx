import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'

interface Plan { id: string; nombre: string; descripcion: string | null; precioMensual: number; destacado: boolean; activo: boolean; orden: number }
const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

export function AdminPlanes() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [form, setForm] = useState({ id: '', nombre: '', precioMensual: '' })
  const [msg, setMsg] = useState('')
  const cargar = () => adminService.planes().then((r) => setPlanes(r.planes as Plan[])).catch(() => {})
  useEffect(() => { cargar() }, [])

  async function crear() {
    try {
      await adminService.crearPlan({ id: form.id, nombre: form.nombre, precioMensual: Number(form.precioMensual) })
      setForm({ id: '', nombre: '', precioMensual: '' }); setMsg(''); cargar()
    } catch (e) { setMsg(e instanceof ApiError ? e.message : 'Error') }
  }
  async function toggle(p: Plan) { await adminService.actualizarPlan(p.id, { activo: !p.activo }).catch(() => {}); cargar() }
  async function precio(p: Plan, v: number) { await adminService.actualizarPlan(p.id, { precioMensual: v }).catch(() => {}); cargar() }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Planes de suscripción</h1>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
            <th className="text-left px-6 py-3">Plan</th><th className="text-left px-6 py-3">Precio mensual</th><th className="text-left px-6 py-3">Estado</th><th className="px-6 py-3"></th>
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
          <input value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value.toUpperCase() })} placeholder="CÓDIGO (ej PREMIUM)" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre comercial" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white" />
          <input value={form.precioMensual} onChange={(e) => setForm({ ...form, precioMensual: e.target.value })} placeholder="Precio mensual" inputMode="numeric" className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white font-mono" />
          <button onClick={crear} disabled={!form.id || !form.nombre} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">Crear</button>
        </div>
        {msg && <p className="text-rose-400 text-sm mt-2">{msg}</p>}
      </div>
    </div>
  )
}
