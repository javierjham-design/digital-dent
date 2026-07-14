import { useEffect, useState } from 'react'
import type { PrestacionDTO } from '@shared/types'
import { prestacionesService, categoriasService, type CategoriaPrestacionDTO } from '@/services/catalogo.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { fmtMonto } from '@/lib/money'

const fmtCLP = fmtMonto
const SIN = '__sin__'

export function Prestaciones() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const puedeConfig = esAdmin || Boolean(user?.permisos?.puedeConfigurarClinica)
  const [items, setItems] = useState<PrestacionDTO[]>([])
  const [cats, setCats] = useState<CategoriaPrestacionDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', categoria: '', precio: '', duracion: '30' })
  const [nuevaSeccion, setNuevaSeccion] = useState('')
  const [busy, setBusy] = useState(false)

  function cargar() {
    setCargando(true)
    Promise.all([
      prestacionesService.listar().then(setItems),
      categoriasService.listar().then(setCats),
    ]).catch((e) => setError(e instanceof Error ? e.message : 'Error')).finally(() => setCargando(false))
  }
  useEffect(cargar, [])

  const aviso = (m: string) => setError(m)
  const correr = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await fn(); cargar() } catch (e) { aviso(e instanceof ApiError ? e.message : 'Error') } finally { setBusy(false) }
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault()
    const precio = Number(form.precio)
    if (!form.nombre.trim() || !Number.isFinite(precio)) return
    await correr(async () => {
      await prestacionesService.crear({ nombre: form.nombre.trim(), categoria: form.categoria || undefined, precio, duracion: Number(form.duracion) || 30 })
      setForm({ nombre: '', categoria: '', precio: '', duracion: '30' }); setShowForm(false)
    })
  }

  async function agregarSeccion() {
    const n = nuevaSeccion.trim(); if (!n) return
    await correr(async () => { await categoriasService.crear(n); setNuevaSeccion('') })
  }
  const moverSeccion = (idx: number, dir: -1 | 1) => {
    const arr = [...cats]; const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    correr(() => categoriasService.reordenar(arr.map((c) => c.id)))
  }

  // Agrupar prestaciones por categoría gestionada; el resto va a "Sin categoría".
  const nombres = new Set(cats.map((c) => c.nombre))
  const porCat = new Map<string, PrestacionDTO[]>()
  for (const p of items) {
    const k = p.categoria && nombres.has(p.categoria) ? p.categoria : SIN
    const arr = porCat.get(k) ?? []; arr.push(p); porCat.set(k, arr)
  }
  const sinCat = porCat.get(SIN) ?? []

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prestaciones</h1>
          <p className="text-slate-500 text-sm mt-1">{items.length} prestaciones · {cats.length} secciones</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">
          {showForm ? 'Cerrar' : '+ Nueva prestación'}
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {showForm && (
        <form onSubmit={crear} className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 grid sm:grid-cols-4 gap-3">
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre *" required
            className="sm:col-span-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Sin sección</option>
            {cats.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
          <input value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder="Precio *" required inputMode="numeric"
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <div className="sm:col-span-4">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{busy ? 'Guardando…' : 'Agregar'}</button>
          </div>
        </form>
      )}

      {/* Agregar sección (solo quien puede configurar) */}
      {puedeConfig && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-5 flex gap-2 items-center flex-wrap">
          <span className="text-sm font-medium text-slate-600">Nueva sección</span>
          <input value={nuevaSeccion} onChange={(e) => setNuevaSeccion(e.target.value)} placeholder="Ej: Laboratorio, Insumos, Ortodoncia…"
            className="flex-1 min-w-[12rem] px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <button onClick={agregarSeccion} disabled={busy || !nuevaSeccion.trim()} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm rounded-lg">Agregar sección</button>
        </div>
      )}

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p> : (
        <div className="space-y-5">
          {cats.map((c, i) => (
            <Seccion key={c.id} cat={c} idx={i} total={cats.length} puedeConfig={puedeConfig}
              prestaciones={porCat.get(c.nombre) ?? []} cats={cats} correr={correr} onMover={moverSeccion} />
          ))}
          {sinCat.length > 0 && (
            <Seccion cat={null} idx={-1} total={0} puedeConfig={puedeConfig} prestaciones={sinCat} cats={cats} correr={correr} onMover={moverSeccion} />
          )}
        </div>
      )}
    </div>
  )
}

function Seccion({ cat, idx, total, puedeConfig, prestaciones, cats, correr, onMover }: {
  cat: CategoriaPrestacionDTO | null; idx: number; total: number; puedeConfig: boolean
  prestaciones: PrestacionDTO[]; cats: CategoriaPrestacionDTO[]
  correr: (fn: () => Promise<unknown>) => Promise<void>; onMover: (idx: number, dir: -1 | 1) => void
}) {
  const [editNombre, setEditNombre] = useState(false)
  const [nombre, setNombre] = useState(cat?.nombre ?? '')
  const totalSec = prestaciones.reduce((s, p) => s + p.precio, 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {cat && puedeConfig && editNombre ? (
            <>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-sm" />
              <button onClick={() => correr(async () => { await categoriasService.actualizar(cat.id, { nombre: nombre.trim() || cat.nombre }); setEditNombre(false) })} className="text-xs font-semibold text-cyan-700">Guardar</button>
              <button onClick={() => { setNombre(cat.nombre); setEditNombre(false) }} className="text-xs text-slate-400">Cancelar</button>
            </>
          ) : (
            <span className="text-sm font-semibold text-slate-800 truncate">{cat?.nombre ?? 'Sin sección'}</span>
          )}
          {cat?.noLiquidable && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">No liquidable</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-slate-500">{fmtCLP(totalSec)}</span>
          {cat && puedeConfig && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer" title="No se considera para la liquidación del profesional (laboratorios/insumos)">
                <input type="checkbox" checked={cat.noLiquidable} onChange={(e) => correr(() => categoriasService.actualizar(cat.id, { noLiquidable: e.target.checked }))} />
                No liquidable
              </label>
              {!editNombre && <button onClick={() => { setNombre(cat.nombre); setEditNombre(true) }} className="text-slate-300 hover:text-cyan-600 text-sm" title="Renombrar sección">✎</button>}
              <div className="flex flex-col -my-1 leading-none">
                <button disabled={idx === 0} onClick={() => onMover(idx, -1)} className="text-slate-300 hover:text-cyan-600 disabled:opacity-30 text-[10px]" title="Subir">▲</button>
                <button disabled={idx === total - 1} onClick={() => onMover(idx, 1)} className="text-slate-300 hover:text-cyan-600 disabled:opacity-30 text-[10px]" title="Bajar">▼</button>
              </div>
              <button onClick={() => { if (confirm(`¿Eliminar la sección "${cat.nombre}"? Sus prestaciones quedan sin sección (no se borran).`)) correr(() => categoriasService.eliminar(cat.id)) }} className="text-slate-300 hover:text-rose-600 text-sm" title="Eliminar sección">🗑</button>
            </>
          )}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {prestaciones.length === 0 ? <p className="px-5 py-3 text-xs text-slate-400">Sin prestaciones.</p>
          : prestaciones.map((p) => <PrestacionFila key={p.id} p={p} cats={cats} correr={correr} />)}
      </div>
    </div>
  )
}

function PrestacionFila({ p, cats, correr }: { p: PrestacionDTO; cats: CategoriaPrestacionDTO[]; correr: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [edit, setEdit] = useState(false)
  const [nombre, setNombre] = useState(p.nombre)
  const [precio, setPrecio] = useState(String(Math.round(p.precio)))
  const [categoria, setCategoria] = useState(p.categoria ?? '')

  function guardar() {
    const pr = Number(precio)
    correr(async () => { await prestacionesService.actualizar(p.id, { nombre: nombre.trim() || p.nombre, precio: Number.isFinite(pr) ? pr : p.precio, categoria: categoria || null }); setEdit(false) })
  }

  if (edit) return (
    <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="flex-1 min-w-[10rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
        <option value="">Sin sección</option>
        {cats.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
      </select>
      <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono" />
      <button onClick={guardar} className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-lg">Guardar</button>
      <button onClick={() => { setNombre(p.nombre); setPrecio(String(Math.round(p.precio))); setCategoria(p.categoria ?? ''); setEdit(false) }} className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">Cancelar</button>
    </div>
  )
  return (
    <div className="flex items-center justify-between px-5 py-3 gap-3">
      <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="font-mono text-sm text-slate-700">{fmtCLP(p.precio)}</span>
        <button onClick={() => setEdit(true)} className="text-xs text-cyan-600 hover:text-cyan-700">Editar</button>
        <button onClick={() => { if (confirm('¿Eliminar esta prestación?')) correr(() => prestacionesService.eliminar(p.id)) }} className="text-xs text-rose-400 hover:text-rose-600">Eliminar</button>
      </div>
    </div>
  )
}
