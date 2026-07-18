import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'
import { ApiError } from '@/services/api'
import { MODULOS } from '@shared/constants/modulos'

interface Plan {
  id: string; nombre: string; descripcion: string | null
  precioMensual: number; precioMensualUSD: number; precioAnual: number | null; precioAnualUSD: number | null
  maxProfesionales: number; modulos: string[]; caracteristicas: string[]
  destacado: boolean; activo: boolean; orden: number
}
const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtUSD = (n: number) => 'US$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
const moduloNombre = (code: string) => MODULOS.find((m) => m.code === code)?.nombre ?? code

export function AdminPlanes() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [editar, setEditar] = useState<Plan | 'nuevo' | null>(null)
  const cargar = () => adminService.planes().then((r) => setPlanes((r.planes as Plan[]).sort((a, b) => a.orden - b.orden))).catch(() => {})
  useEffect(() => { cargar() }, [])

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Planes de suscripción</h1>
          <p className="text-sm text-slate-400 mt-1">Precios (mensual/anual, CLP y USD), usuarios base y módulos incluidos. Los cambios se reflejan en las landings y en la app.</p>
        </div>
        <button onClick={() => setEditar('nuevo')} className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl shrink-0">+ Nuevo plan</button>
      </div>

      {planes.length === 0 ? <p className="text-slate-500 text-sm">Cargando…</p> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {planes.map((p) => (
            <div key={p.id} className={`rounded-2xl border p-5 flex flex-col ${p.destacado ? 'border-cyan-500/60 bg-slate-900' : 'border-slate-800 bg-slate-900'} ${!p.activo ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-white">{p.nombre}</h3>
                    {p.destacado && <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">Destacado</span>}
                    {!p.activo && <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">Inactivo</span>}
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{p.id}</p>
                </div>
                <button onClick={() => setEditar(p)} className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 shrink-0">Editar</button>
              </div>
              {p.descripcion && <p className="text-xs text-slate-400 mt-2 line-clamp-2">{p.descripcion}</p>}
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <Dato l="Mensual CLP" v={fmtCLP(p.precioMensual)} />
                <Dato l="Mensual USD" v={fmtUSD(p.precioMensualUSD)} />
                <Dato l="Anual CLP" v={p.precioAnual != null ? fmtCLP(p.precioAnual) : '—'} />
                <Dato l="Anual USD" v={p.precioAnualUSD != null ? fmtUSD(p.precioAnualUSD) : '—'} />
              </div>
              <div className="mt-3 text-xs text-slate-400">
                <span className="text-slate-500">Usuarios base:</span> <span className="text-white font-semibold">{p.maxProfesionales}</span> con agenda
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.modulos.length === 0 ? <span className="text-[11px] text-slate-600">Sin módulos</span>
                  : p.modulos.map((m) => <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">{moduloNombre(m)}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}

      {editar && <PlanEditor plan={editar === 'nuevo' ? null : editar} onClose={() => setEditar(null)} onSaved={() => { setEditar(null); cargar() }} onDeleted={() => { setEditar(null); cargar() }} />}
    </div>
  )
}

function Dato({ l, v }: { l: string; v: string }) {
  return <div><p className="text-[10px] uppercase tracking-wide text-slate-500">{l}</p><p className="text-white font-mono">{v}</p></div>
}

function PlanEditor({ plan, onClose, onSaved, onDeleted }: { plan: Plan | null; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const nuevo = plan === null
  const [f, setF] = useState({
    id: plan?.id ?? '', nombre: plan?.nombre ?? '', descripcion: plan?.descripcion ?? '',
    precioMensual: String(plan?.precioMensual ?? ''), precioMensualUSD: String(plan?.precioMensualUSD ?? ''),
    precioAnual: plan?.precioAnual != null ? String(plan.precioAnual) : '', precioAnualUSD: plan?.precioAnualUSD != null ? String(plan.precioAnualUSD) : '',
    maxProfesionales: String(plan?.maxProfesionales ?? 2), orden: String(plan?.orden ?? 0),
    destacado: plan?.destacado ?? false, activo: plan?.activo ?? true,
  })
  const [modulos, setModulos] = useState<string[]>(plan?.modulos ?? MODULOS.map((m) => m.code))
  const [caracteristicas, setCaracteristicas] = useState<string[]>(plan?.caracteristicas ?? [])
  const [nuevaCarac, setNuevaCarac] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState('')
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }))
  const toggleModulo = (code: string) => setModulos((ms) => ms.includes(code) ? ms.filter((c) => c !== code) : [...ms, code])
  const addCarac = () => { const t = nuevaCarac.trim(); if (t) { setCaracteristicas((cs) => [...cs, t]); setNuevaCarac('') } }

  async function guardar() {
    setGuardando(true); setErr('')
    const payload = {
      nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null,
      precioMensual: Number(f.precioMensual) || 0, precioMensualUSD: Number(f.precioMensualUSD) || 0,
      precioAnual: f.precioAnual.trim() === '' ? null : Number(f.precioAnual),
      precioAnualUSD: f.precioAnualUSD.trim() === '' ? null : Number(f.precioAnualUSD),
      maxProfesionales: Number(f.maxProfesionales) || 1, orden: Number(f.orden) || 0,
      modulos, caracteristicas, destacado: f.destacado, activo: f.activo,
    }
    try {
      if (nuevo) await adminService.crearPlan({ id: f.id.trim().toUpperCase(), ...payload })
      else await adminService.actualizarPlan(plan!.id, payload)
      onSaved()
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo guardar'); setGuardando(false) }
  }
  async function eliminar() {
    if (!plan || !confirm(`¿Eliminar el plan "${plan.nombre}"? Las clínicas con este plan no se borran, pero perderán su referencia.`)) return
    try { await adminService.eliminarPlan(plan.id); onDeleted() } catch (e) { setErr(e instanceof ApiError ? e.message : 'No se pudo eliminar') }
  }

  const inp = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl w-full max-w-2xl my-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-white">{nuevo ? 'Nuevo plan' : `Editar · ${plan!.nombre}`}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-3">
            {nuevo && <Campo label="Código (id)"><input value={f.id} onChange={(e) => set({ id: e.target.value.toUpperCase() })} placeholder="PREMIUM" className={`${inp} font-mono`} /></Campo>}
            <Campo label="Nombre comercial"><input value={f.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Plan Pro" className={inp} /></Campo>
          </div>
          <Campo label="Descripción"><textarea value={f.descripcion} onChange={(e) => set({ descripcion: e.target.value })} rows={2} placeholder="Para clínicas con varios profesionales…" className={inp} /></Campo>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Precios</p>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Mensual CLP"><input value={f.precioMensual} onChange={(e) => set({ precioMensual: e.target.value })} inputMode="numeric" className={`${inp} font-mono`} /></Campo>
              <Campo label="Mensual USD"><input value={f.precioMensualUSD} onChange={(e) => set({ precioMensualUSD: e.target.value })} inputMode="decimal" className={`${inp} font-mono`} /></Campo>
              <Campo label="Anual CLP (opcional)"><input value={f.precioAnual} onChange={(e) => set({ precioAnual: e.target.value })} inputMode="numeric" placeholder="—" className={`${inp} font-mono`} /></Campo>
              <Campo label="Anual USD (opcional)"><input value={f.precioAnualUSD} onChange={(e) => set({ precioAnualUSD: e.target.value })} inputMode="decimal" placeholder="—" className={`${inp} font-mono`} /></Campo>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Usuarios base (con agenda)"><input value={f.maxProfesionales} onChange={(e) => set({ maxProfesionales: e.target.value })} inputMode="numeric" className={`${inp} font-mono`} /></Campo>
            <Campo label="Orden (menor = primero)"><input value={f.orden} onChange={(e) => set({ orden: e.target.value })} inputMode="numeric" className={`${inp} font-mono`} /></Campo>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Módulos incluidos</p>
            <div className="space-y-1.5">
              {MODULOS.map((m) => (
                <label key={m.code} className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer">
                  <input type="checkbox" checked={modulos.includes(m.code)} onChange={() => toggleModulo(m.code)} className="mt-0.5" />
                  <span><span className="text-sm text-white">{m.nombre}</span><span className="block text-xs text-slate-500">{m.descripcion}</span></span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Características (viñetas de la landing)</p>
            <div className="space-y-1.5">
              {caracteristicas.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={c} onChange={(e) => setCaracteristicas((cs) => cs.map((x, j) => j === i ? e.target.value : x))} className={`${inp} flex-1`} />
                  <button onClick={() => setCaracteristicas((cs) => cs.filter((_, j) => j !== i))} className="text-slate-500 hover:text-rose-400 text-sm shrink-0 px-1">✕</button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <input value={nuevaCarac} onChange={(e) => setNuevaCarac(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCarac() } }} placeholder="Agregar característica…" className={`${inp} flex-1`} />
                <button onClick={addCarac} className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm rounded-lg shrink-0">Agregar</button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={f.destacado} onChange={(e) => set({ destacado: e.target.checked })} /> Destacado</label>
            <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={f.activo} onChange={(e) => set({ activo: e.target.checked })} /> Activo (visible en landings)</label>
          </div>

          {err && <p className="text-rose-400 text-sm">{err}</p>}
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-slate-800">
          {!nuevo ? <button onClick={eliminar} className="text-xs font-semibold text-rose-400 hover:text-rose-300">Eliminar plan</button> : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm font-medium rounded-lg">Cancelar</button>
            <button onClick={guardar} disabled={guardando || !f.nombre.trim() || (nuevo && !f.id.trim())} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">{guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-medium text-slate-400 mb-1">{label}</span>{children}</label>
}
