import { useEffect, useMemo, useState } from 'react'
import type { PrestacionDTO } from '@shared/types'
import { AREA_LABELS, type AreaClinica } from '@shared/constants/areas'
import { prestacionesService, categoriasService, type CategoriaPrestacionDTO } from '@/services/catalogo.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'
import { fmtMonto } from '@/lib/money'

const fmtCLP = fmtMonto
const SIN = '__sin__'
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Prestaciones() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const puedeGestionar = esAdmin || Boolean(user?.permisos?.puedeGestionarPrestaciones)
  // Áreas efectivas del usuario (clínica ∩ usuario, ya resueltas en la sesión).
  // Cada área tiene su catálogo COMPLETO e independiente; todo lo de abajo opera
  // dentro del área activa. Con una sola área el selector no se muestra.
  const areas = useMemo(() => (user?.areas ?? []) as AreaClinica[], [user?.areas])
  const [area, setArea] = useState<AreaClinica | ''>('')
  useEffect(() => { if (!area && areas.length > 0) setArea(areas[0]) }, [areas, area])
  const [items, setItems] = useState<PrestacionDTO[]>([])
  const [cats, setCats] = useState<CategoriaPrestacionDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', categoriaId: '', precio: '', duracion: '30' })
  const [nuevaSeccion, setNuevaSeccion] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('') // buscador de prestaciones

  function cargar() {
    if (!area) return
    setCargando(true)
    Promise.all([
      prestacionesService.listar(area).then(setItems),
      categoriasService.listar(area).then(setCats),
    ]).catch((e) => setError(e instanceof Error ? e.message : 'Error')).finally(() => setCargando(false))
  }
  useEffect(cargar, [area])

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
      await prestacionesService.crear({ nombre: form.nombre.trim(), categoriaId: form.categoriaId || undefined, precio, duracion: Number(form.duracion) || 30 })
      setForm({ nombre: '', categoriaId: '', precio: '', duracion: '30' }); setShowForm(false)
    })
  }

  async function agregarSeccion() {
    const n = nuevaSeccion.trim(); if (!n || !area) return
    await correr(async () => { await categoriasService.crear(n, area); setNuevaSeccion('') })
  }
  const moverSeccion = (idx: number, dir: -1 | 1) => {
    const arr = [...cats]; const j = idx + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    correr(() => categoriasService.reordenar(arr.map((c) => c.id)))
  }

  // Agrupar prestaciones por sección, por categoriaId (fuente de verdad); las
  // legacy sin FK caen por nombre. El resto va a "Sin sección".
  const catPorNombre = new Map(cats.map((c) => [c.nombre, c.id]))
  const idsCat = new Set(cats.map((c) => c.id))
  const porCat = new Map<string, PrestacionDTO[]>()
  for (const p of items) {
    const k = (p.categoriaId && idsCat.has(p.categoriaId)) ? p.categoriaId : (p.categoria && catPorNombre.get(p.categoria)) || SIN
    const arr = porCat.get(k) ?? []; arr.push(p); porCat.set(k, arr)
  }
  const sinCat = porCat.get(SIN) ?? []

  // Buscador: filtra por nombre o sección (insensible a acentos/mayúsculas). Cuando
  // hay búsqueda, se muestran los resultados en una lista plana (de todas las
  // secciones) para encontrar y editar rápido la prestación buscada.
  const needle = norm(q.trim())
  const buscando = needle.length >= 1
  const filtrados = buscando
    ? items.filter((p) => norm(p.nombre).includes(needle) || (p.categoria ? norm(p.categoria).includes(needle) : false))
    : []

  if (!puedeGestionar) return <p className="text-slate-500 text-sm max-w-md">No tienes acceso a la gestión de prestaciones. Pídele a un administrador el permiso <span className="font-medium">“Gestionar prestaciones”</span>.</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Prestaciones</h1>
          {/* El contador refleja el ÁREA ACTIVA, no el total global. */}
          <p className="text-slate-500 text-sm mt-1">{items.length} prestaciones · {cats.length} secciones{areas.length > 1 && area ? ` · ${AREA_LABELS[area as AreaClinica]}` : ''}</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">
          {showForm ? 'Cerrar' : '+ Nueva prestación'}
        </button>
      </div>

      {/* Selector de área: solo si el usuario tiene más de una habilitada. */}
      {areas.length > 1 && (
        <div className="flex gap-1 mb-5 border-b border-slate-200">
          {areas.map((a) => (
            <button key={a} onClick={() => setArea(a)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${area === a ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {AREA_LABELS[a]}
            </button>
          ))}
        </div>
      )}

      {/* Buscador de prestaciones */}
      <div className="mb-5 relative sm:max-w-md">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar prestación por nombre…"
          className="w-full pl-9 pr-8 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm" title="Limpiar">✕</button>}
      </div>

      {error && <p className="mb-4 text-sm text-rose-600">{error}</p>}

      {showForm && (
        <form onSubmit={crear} className="bg-white rounded-2xl border border-slate-200 p-5 mb-5 grid sm:grid-cols-4 gap-3">
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre *" required
            className="sm:col-span-2 px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Sin sección</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} placeholder="Precio *" required inputMode="numeric"
            className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <div className="sm:col-span-4">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm font-semibold rounded-xl">{busy ? 'Guardando…' : 'Agregar'}</button>
          </div>
        </form>
      )}

      {/* Agregar sección (solo quien puede configurar) */}
      {puedeGestionar && (
        <div className="bg-white rounded-2xl border border-slate-200 p-3 mb-5 flex gap-2 items-center flex-wrap">
          <span className="text-sm font-medium text-slate-600">Nueva sección</span>
          <input value={nuevaSeccion} onChange={(e) => setNuevaSeccion(e.target.value)} placeholder="Ej: Laboratorio, Insumos, Ortodoncia…"
            className="flex-1 min-w-[12rem] px-3 py-2 border border-slate-200 rounded-lg text-sm" />
          <button onClick={agregarSeccion} disabled={busy || !nuevaSeccion.trim()} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm rounded-lg">Agregar sección</button>
        </div>
      )}

      {cargando ? <p className="text-slate-500 text-sm">Cargando…</p> : buscando ? (
        // Resultados de búsqueda: lista plana (todas las secciones), editable directo.
        <div>
          <p className="text-xs text-slate-400 mb-2">{filtrados.length} resultado{filtrados.length === 1 ? '' : 's'} para “{q.trim()}”</p>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {filtrados.length === 0
              ? <p className="px-5 py-4 text-sm text-slate-400">Sin resultados. Probá con otra palabra{areas.length > 1 ? ' o cambiá de área' : ''}.</p>
              : filtrados.map((p) => <PrestacionFila key={p.id} p={p} cats={cats} correr={correr} />)}
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {cats.map((c, i) => (
            <Seccion key={c.id} cat={c} idx={i} total={cats.length} puedeGestionar={puedeGestionar}
              prestaciones={porCat.get(c.id) ?? []} cats={cats} correr={correr} onMover={moverSeccion} />
          ))}
          {sinCat.length > 0 && (
            <Seccion cat={null} idx={-1} total={0} puedeGestionar={puedeGestionar} prestaciones={sinCat} cats={cats} correr={correr} onMover={moverSeccion} defaultOpen />
          )}
        </div>
      )}
    </div>
  )
}

function Seccion({ cat, idx, total, puedeGestionar, prestaciones, cats, correr, onMover, defaultOpen }: {
  cat: CategoriaPrestacionDTO | null; idx: number; total: number; puedeGestionar: boolean
  prestaciones: PrestacionDTO[]; cats: CategoriaPrestacionDTO[]
  correr: (fn: () => Promise<unknown>) => Promise<void>; onMover: (idx: number, dir: -1 | 1) => void
  defaultOpen?: boolean
}) {
  const [editNombre, setEditNombre] = useState(false)
  const [nombre, setNombre] = useState(cat?.nombre ?? '')
  const [abierto, setAbierto] = useState(Boolean(defaultOpen))
  const conteo = `${prestaciones.length} prestaci${prestaciones.length === 1 ? 'ón' : 'ones'}`

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex-wrap">
        <button onClick={() => setAbierto((v) => !v)} className="flex items-center gap-2 min-w-0 text-left">
          <span className="text-slate-400 text-xs w-3">{abierto ? '▾' : '▸'}</span>
          {cat && puedeGestionar && editNombre ? (
            <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-sm" />
              <button type="button" onClick={() => correr(async () => { await categoriasService.actualizar(cat.id, { nombre: nombre.trim() || cat.nombre }); setEditNombre(false) })} className="text-xs font-semibold text-cyan-700">Guardar</button>
              <button type="button" onClick={() => { setNombre(cat.nombre); setEditNombre(false) }} className="text-xs text-slate-400">Cancelar</button>
            </span>
          ) : (
            <span className="text-sm font-semibold text-slate-800 truncate">{cat?.nombre ?? 'Sin sección'}</span>
          )}
          <span className="text-xs text-slate-400 whitespace-nowrap">· {conteo}</span>
          {cat?.noLiquidable && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">No liquidable</span>}
        </button>
        <div className="flex items-center gap-3">
          {cat && puedeGestionar && (
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
      {abierto && (
        <div className="divide-y divide-slate-100">
          {prestaciones.length === 0 ? <p className="px-5 py-3 text-xs text-slate-400">Sin prestaciones.</p>
            : prestaciones.map((p) => <PrestacionFila key={p.id} p={p} cats={cats} correr={correr} />)}
        </div>
      )}
    </div>
  )
}

function PrestacionFila({ p, cats, correr }: { p: PrestacionDTO; cats: CategoriaPrestacionDTO[]; correr: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [edit, setEdit] = useState(false)
  const [nombre, setNombre] = useState(p.nombre)
  const [precio, setPrecio] = useState(String(Math.round(p.precio)))
  // La sección se cambia por categoriaId (fuente de verdad); las legacy sin FK
  // muestran su sección por nombre.
  const [categoriaId, setCategoriaId] = useState(p.categoriaId ?? cats.find((c) => c.nombre === p.categoria)?.id ?? '')

  function guardar() {
    const pr = Number(precio)
    correr(async () => { await prestacionesService.actualizar(p.id, { nombre: nombre.trim() || p.nombre, precio: Number.isFinite(pr) ? pr : p.precio, categoriaId: categoriaId || null }); setEdit(false) })
  }

  if (edit) return (
    <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="flex-1 min-w-[10rem] px-2 py-1.5 border border-slate-200 rounded-lg text-sm" />
      <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">
        <option value="">Sin sección</option>
        {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="numeric" className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-sm font-mono" />
      <button onClick={guardar} className="px-3 py-1.5 bg-cyan-600 text-white text-xs font-semibold rounded-lg">Guardar</button>
      <button onClick={() => { setNombre(p.nombre); setPrecio(String(Math.round(p.precio))); setEdit(false) }} className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs rounded-lg">Cancelar</button>
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
