'use client'

import { useEffect, useMemo, useState } from 'react'
import { OdontogramaSelector, type SeleccionDental } from './OdontogramaSelector'
import { formatCLP } from '@/lib/utils'

const ESTADO_STYLES: Record<string, { label: string; cls: string }> = {
  PLANIFICADO: { label: 'Planificado', cls: 'bg-slate-100 text-slate-600' },
  EN_PROGRESO: { label: 'En progreso', cls: 'bg-blue-100 text-blue-700' },
  COMPLETADO:  { label: 'Completado',  cls: 'bg-emerald-100 text-emerald-700' },
}

type Prestacion = { id: string; nombre: string; precio: number; categoria: string | null }

type Tratamiento = {
  id: string
  diente: number | null
  cara: string | null
  precio: number
  descuento: number
  estado: string
  notas: string | null
  prestacion: { id: string; nombre: string; categoria?: string | null; precio?: number }
  doctor?: { id: string; name: string | null } | null
  seccionId?: string | null
}

type Seccion = {
  id: string
  titulo: string
  orden: number
  fechaTentativa: string | null
  diasDesdeAnterior: number | null
  notas: string | null
  tratamientos: Tratamiento[]
}

type Plan = {
  id: string
  nombre: string
  estado: string
  notas: string | null
  fechaInicio: string | null
  createdAt: string
  secciones?: Seccion[]
  tratamientos?: Tratamiento[] // los sin sección
  _count?: { tratamientos: number; secciones: number }
}

type Permisos = {
  puedeModificarPrecio: boolean
  puedeAplicarDescuento: boolean
}

type Props = {
  pacienteId: string
  prestaciones: Prestacion[]
  dientesExistentes?: { numero: number; estadoActual?: string }[]
  permisos: Permisos
}

function subtotal(t: Tratamiento): number {
  return t.precio * (1 - (t.descuento || 0) / 100)
}

export function PlanesTratamiento({ pacienteId, prestaciones, dientesExistentes = [], permisos }: Props) {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activePlan, setActivePlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)

  async function cargarPlanes() {
    const r = await fetch(`/api/planes-tratamiento?pacienteId=${pacienteId}`, { cache: 'no-store' })
    if (!r.ok) return
    const data = await r.json()
    setPlanes(data)
    setLoading(false)
  }

  async function cargarPlan(id: string) {
    const r = await fetch(`/api/planes-tratamiento/${id}`, { cache: 'no-store' })
    if (!r.ok) return
    const data = await r.json()
    setActivePlan(data)
  }

  useEffect(() => { cargarPlanes() }, [pacienteId])
  useEffect(() => {
    if (activeId) cargarPlan(activeId)
    else setActivePlan(null)
  }, [activeId])

  async function crearPlan(nombre: string) {
    const r = await fetch('/api/planes-tratamiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacienteId, nombre }),
    })
    if (!r.ok) return
    const plan = await r.json()
    setActiveId(plan.id)
    await cargarPlanes()
  }

  async function eliminarPlan(id: string) {
    if (!confirm('¿Eliminar este plan? Los tratamientos quedan pero pierden su asociación al plan.')) return
    await fetch(`/api/planes-tratamiento/${id}`, { method: 'DELETE' })
    setActiveId(null)
    cargarPlanes()
  }

  if (loading) {
    return <div className="text-slate-400 text-sm p-8 text-center">Cargando planes...</div>
  }

  if (activePlan) {
    return (
      <PlanDetalle
        plan={activePlan}
        prestaciones={prestaciones}
        dientesExistentes={dientesExistentes}
        permisos={permisos}
        pacienteId={pacienteId}
        onBack={() => { setActiveId(null); cargarPlanes() }}
        onChanged={() => cargarPlan(activePlan.id)}
        onDelete={() => eliminarPlan(activePlan.id)}
      />
    )
  }

  return (
    <ListaPlanes
      planes={planes}
      onSelect={setActiveId}
      onCreate={crearPlan}
    />
  )
}

function ListaPlanes({ planes, onSelect, onCreate }: { planes: Plan[]; onSelect: (id: string) => void; onCreate: (nombre: string) => void }) {
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('Plan de tratamiento')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Planes de tratamiento</h3>
          <p className="text-xs text-slate-500 mt-0.5">{planes.length} plan{planes.length === 1 ? '' : 'es'}</p>
        </div>
        <button
          onClick={() => setCreando(true)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo plan
        </button>
      </div>

      {creando && (
        <div className="bg-white border border-cyan-200 rounded-2xl p-5 shadow-sm">
          <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Nombre del plan</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: Plan integral 2026"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-3"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setCreando(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button
              onClick={() => { onCreate(nombre); setCreando(false); setNombre('Plan de tratamiento') }}
              className="px-3 py-1.5 text-sm bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium"
            >
              Crear plan
            </button>
          </div>
        </div>
      )}

      {planes.length === 0 && !creando ? (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-12 text-center">
          <p className="text-slate-500 text-sm mb-3">El paciente no tiene planes de tratamiento aún.</p>
          <button onClick={() => setCreando(true)} className="text-cyan-700 text-sm font-medium hover:underline">
            Crear el primer plan
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {planes.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="text-left bg-white border border-slate-200 hover:border-cyan-500 rounded-2xl p-5 transition-colors shadow-sm hover:shadow"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h4 className="font-semibold text-slate-900">{p.nombre}</h4>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  p.estado === 'ACTIVO' ? 'bg-emerald-100 text-emerald-700'
                  : p.estado === 'COMPLETADO' ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-600'
                }`}>{p.estado}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 mt-3">
                <div>
                  <p className="uppercase tracking-wider mb-0.5">Secciones</p>
                  <p className="text-slate-900 font-semibold text-sm">{p._count?.secciones ?? 0}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wider mb-0.5">Acciones</p>
                  <p className="text-slate-900 font-semibold text-sm">{p._count?.tratamientos ?? 0}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-3">
                Creado: {new Date(p.createdAt).toLocaleDateString('es-CL')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PlanDetalle({
  plan, prestaciones, dientesExistentes, permisos, pacienteId, onBack, onChanged, onDelete,
}: {
  plan: Plan
  prestaciones: Prestacion[]
  dientesExistentes: { numero: number; estadoActual?: string }[]
  permisos: Permisos
  pacienteId: string
  onBack: () => void
  onChanged: () => void
  onDelete: () => void
}) {
  const [editandoTratamiento, setEditandoTratamiento] = useState<Tratamiento | null>(null)
  // Sección destino preferida para el próximo "agregar acción" (sticky entre adds).
  const [seccionDestino, setSeccionDestino] = useState<string>('')

  const secciones = plan.secciones ?? []

  const totalGeneral = useMemo(() => {
    const ts = [...(plan.tratamientos ?? []), ...secciones.flatMap((s) => s.tratamientos)]
    return ts.reduce((s, t) => s + subtotal(t), 0)
  }, [plan, secciones])

  async function crearSeccion() {
    const r = await fetch(`/api/planes-tratamiento/${plan.id}/secciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (r.ok) {
      const nueva = await r.json()
      setSeccionDestino(nueva.id) // auto-selecciona la sección recién creada
    }
    onChanged()
  }

  async function agregarAccion(payload: { prestacionId: string; piezas: number[]; zona?: string; precio: number; descuento?: number; notas?: string }) {
    await fetch('/api/tratamientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        pacienteId,
        planId: plan.id,
        seccionId: seccionDestino || null,
      }),
    })
    onChanged()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-sm text-slate-500 hover:text-slate-900 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a planes
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <h3 className="font-semibold text-slate-900 text-lg">{plan.nombre}</h3>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-500">Total del plan</p>
            <p className="text-lg font-bold text-cyan-700">{formatCLP(totalGeneral)}</p>
          </div>
          <button onClick={onDelete} className="px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg">
            Eliminar plan
          </button>
        </div>
      </div>

      {/* FORM AGREGAR ACCIÓN — siempre visible arriba */}
      <FormAgregarAccion
        prestaciones={prestaciones}
        dientesExistentes={dientesExistentes}
        permisos={permisos}
        secciones={secciones}
        seccionDestino={seccionDestino}
        onSeccionDestinoChange={setSeccionDestino}
        onCrearSeccion={crearSeccion}
        onSubmit={agregarAccion}
      />

      {/* SECCIONES + SIN-SECCIÓN abajo */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">Acciones del plan</h4>
          <button
            onClick={crearSeccion}
            className="text-xs text-cyan-700 hover:underline font-medium flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva sección
          </button>
        </div>

        {(plan.tratamientos ?? []).length > 0 && (
          <SeccionCard
            titulo="Sin sección asignada"
            tratamientos={plan.tratamientos ?? []}
            onEditar={setEditandoTratamiento}
          />
        )}

        {secciones.map((s) => (
          <SeccionItem
            key={s.id}
            seccion={s}
            onChanged={onChanged}
            onEditar={setEditandoTratamiento}
          />
        ))}

        {secciones.length === 0 && (plan.tratamientos ?? []).length === 0 && (
          <p className="text-sm text-slate-400 text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
            Aún no hay acciones. Agrega la primera con el formulario de arriba.
          </p>
        )}
      </div>

      {editandoTratamiento && (
        <ModalEditarTratamiento
          tratamiento={editandoTratamiento}
          secciones={secciones}
          dientesExistentes={dientesExistentes}
          permisos={permisos}
          onClose={() => setEditandoTratamiento(null)}
          onSaved={() => { setEditandoTratamiento(null); onChanged() }}
          onDeleted={() => { setEditandoTratamiento(null); onChanged() }}
        />
      )}
    </div>
  )
}

function SeccionItem({ seccion, onChanged, onEditar }: {
  seccion: Seccion
  onChanged: () => void
  onEditar: (t: Tratamiento) => void
}) {
  const [editando, setEditando] = useState(false)
  const [titulo, setTitulo] = useState(seccion.titulo)
  const [fechaTentativa, setFechaTentativa] = useState(seccion.fechaTentativa?.slice(0, 10) ?? '')
  const [dias, setDias] = useState<string>(seccion.diasDesdeAnterior?.toString() ?? '')

  async function guardar() {
    await fetch(`/api/secciones-plan/${seccion.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titulo,
        fechaTentativa: fechaTentativa || null,
        diasDesdeAnterior: dias === '' ? null : Number(dias),
      }),
    })
    setEditando(false)
    onChanged()
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar la sección "${seccion.titulo}"? Los tratamientos quedan sueltos.`)) return
    await fetch(`/api/secciones-plan/${seccion.id}`, { method: 'DELETE' })
    onChanged()
  }

  return (
    <SeccionCard
      titulo={seccion.titulo}
      subtitle={
        seccion.fechaTentativa
          ? `Fecha tentativa: ${new Date(seccion.fechaTentativa).toLocaleDateString('es-CL')}`
          : seccion.diasDesdeAnterior
          ? `+${seccion.diasDesdeAnterior} días desde la sección anterior`
          : undefined
      }
      tratamientos={seccion.tratamientos}
      onEditar={onEditar}
      onEditarSeccion={() => setEditando((e) => !e)}
      onEliminarSeccion={eliminar}
    >
      {editando && (
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Título</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Fecha tentativa</label>
              <input type="date" value={fechaTentativa} onChange={(e) => setFechaTentativa(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">Días desde la anterior</label>
              <input type="number" value={dias} onChange={(e) => setDias(e.target.value)} placeholder="Ej: 90" className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setEditando(false)} className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={guardar} className="px-3 py-1 text-xs bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium">Guardar</button>
          </div>
        </div>
      )}
    </SeccionCard>
  )
}

function SeccionCard({
  titulo, subtitle, tratamientos, onEditar, onEditarSeccion, onEliminarSeccion, children,
}: {
  titulo: string
  subtitle?: string
  tratamientos: Tratamiento[]
  onEditar: (t: Tratamiento) => void
  onEditarSeccion?: () => void
  onEliminarSeccion?: () => void
  children?: React.ReactNode
}) {
  const totalSeccion = tratamientos.reduce((s, t) => s + subtotal(t), 0)
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="font-semibold text-slate-900">{titulo}</h4>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{tratamientos.length} acciones · </span>
          <span className="text-sm font-bold text-cyan-700">{formatCLP(totalSeccion)}</span>
          {onEditarSeccion && (
            <button onClick={onEditarSeccion} title="Editar sección" className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {onEliminarSeccion && (
            <button onClick={onEliminarSeccion} title="Eliminar sección" className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {tratamientos.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {tratamientos.map((t) => (
            <button
              key={t.id}
              onClick={() => onEditar(t)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{t.prestacion.nombre}</p>
                <p className="text-xs text-slate-500">
                  {t.diente ? `Pieza ${t.diente}` : t.cara ?? 'General'}
                  {t.notas && ` · ${t.notas}`}
                </p>
              </div>
              <div className="text-right">
                {t.descuento > 0 ? (
                  <>
                    <p className="text-xs line-through text-slate-400">{formatCLP(t.precio)}</p>
                    <p className="text-sm font-bold text-slate-900">{formatCLP(subtotal(t))} <span className="text-xs text-emerald-600">(-{t.descuento}%)</span></p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-slate-900">{formatCLP(t.precio)}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_STYLES[t.estado]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
                {ESTADO_STYLES[t.estado]?.label ?? t.estado}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6">Sin acciones aún.</p>
      )}

      {children}
    </div>
  )
}

function FormAgregarAccion({
  prestaciones, dientesExistentes, permisos, secciones, seccionDestino, onSeccionDestinoChange, onCrearSeccion, onSubmit,
}: {
  prestaciones: Prestacion[]
  dientesExistentes: { numero: number; estadoActual?: string }[]
  permisos: Permisos
  secciones: Seccion[]
  seccionDestino: string
  onSeccionDestinoChange: (id: string) => void
  onCrearSeccion: () => void
  onSubmit: (payload: { prestacionId: string; piezas: number[]; zona?: string; precio: number; descuento?: number; notas?: string }) => Promise<void>
}) {
  const [busqueda, setBusqueda] = useState('')
  const [prestacionId, setPrestacionId] = useState('')
  const [seleccion, setSeleccion] = useState<SeleccionDental>({ tipo: 'PIEZA', piezas: [] })
  const [precio, setPrecio] = useState('')
  const [descuento, setDescuento] = useState('0')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)

  const prestacionSel = prestaciones.find((p) => p.id === prestacionId)

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return prestaciones.slice(0, 20)
    const q = busqueda.toLowerCase()
    return prestaciones
      .filter((p) => p.nombre.toLowerCase().includes(q) || (p.categoria ?? '').toLowerCase().includes(q))
      .slice(0, 20)
  }, [busqueda, prestaciones])

  function elegir(p: Prestacion) {
    setPrestacionId(p.id)
    setPrecio(p.precio.toString())
    setBusqueda(p.nombre)
  }

  const seleccionValida = seleccion.piezas.length > 0 || !!seleccion.zona
  const puedeEnviar = prestacionId && seleccionValida && !saving

  async function submit() {
    if (!puedeEnviar) return
    setSaving(true)
    try {
      await onSubmit({
        prestacionId,
        piezas: seleccion.piezas,
        zona: seleccion.zona,
        precio: Number(precio || prestacionSel?.precio || 0),
        descuento: Number(descuento) || 0,
        notas: notas || undefined,
      })
      // Reset campos puntuales pero mantener sección destino y odontograma vacío
      setPrestacionId('')
      setBusqueda('')
      setPrecio('')
      setDescuento('0')
      setNotas('')
      setSeleccion({ tipo: 'PIEZA', piezas: [] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-cyan-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-100 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h4 className="font-semibold text-slate-900">Agregar acción clínica</h4>
          <p className="text-xs text-slate-500 mt-0.5">Selecciona pieza/zona, busca la prestación y agrégala al plan</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500 font-medium">Sección destino:</label>
          <select
            value={seccionDestino}
            onChange={(e) => onSeccionDestinoChange(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">Sin sección</option>
            {secciones.map((s) => (
              <option key={s.id} value={s.id}>{s.titulo}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onCrearSeccion}
            className="px-3 py-1.5 text-xs font-medium text-cyan-700 hover:bg-cyan-100 rounded-lg flex items-center gap-1"
            title="Crear nueva sección"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva
          </button>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-sm font-medium text-slate-700 mb-3">1. Pieza o zona a tratar</p>
          <OdontogramaSelector
            dientes={dientesExistentes}
            seleccion={seleccion}
            onChange={setSeleccion}
          />
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">2. Prestación</label>
            <div className="relative">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setPrestacionId('') }}
                placeholder="Busca por nombre o categoría..."
                className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            {!prestacionId && busqueda.trim() && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-slate-100 rounded-xl">
                {resultados.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Sin coincidencias.</p>
                ) : (
                  resultados.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => elegir(p)}
                      className="w-full text-left px-3 py-2 hover:bg-cyan-50 transition-colors flex items-center justify-between border-b border-slate-100 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-slate-900">{p.nombre || <span className="text-slate-400 italic">Sin nombre</span>}</p>
                        {p.categoria && <p className="text-xs text-slate-400">{p.categoria}</p>}
                      </div>
                      <span className="text-xs text-slate-500">{formatCLP(p.precio)}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            {prestacionSel && (
              <div className="mt-2 px-3 py-2 bg-cyan-50 border border-cyan-200 rounded-lg flex items-center justify-between">
                <span className="text-sm text-cyan-900 font-medium">{prestacionSel.nombre || 'Prestación seleccionada'}</span>
                <button onClick={() => { setPrestacionId(''); setBusqueda('') }} className="text-xs text-cyan-700 hover:underline">Cambiar</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {permisos.puedeModificarPrecio && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio</label>
                <input
                  type="number"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            )}

            {permisos.puedeAplicarDescuento && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Descuento (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <button
            onClick={submit}
            disabled={!puedeEnviar}
            className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          >
            {saving ? 'Agregando...' : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar acción al plan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalEditarTratamiento({
  tratamiento, secciones, dientesExistentes, permisos, onClose, onSaved, onDeleted,
}: {
  tratamiento: Tratamiento
  secciones: Seccion[]
  dientesExistentes: { numero: number; estadoActual?: string }[]
  permisos: Permisos
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [seleccion, setSeleccion] = useState<SeleccionDental>(
    tratamiento.diente
      ? { tipo: 'PIEZA', piezas: [tratamiento.diente] }
      : { tipo: 'GENERAL', piezas: [], zona: tratamiento.cara ?? undefined }
  )
  const [precio, setPrecio] = useState(tratamiento.precio.toString())
  const [descuento, setDescuento] = useState(tratamiento.descuento.toString())
  const [notas, setNotas] = useState(tratamiento.notas ?? '')
  const [estado, setEstado] = useState(tratamiento.estado)
  const [seccionId, setSeccionId] = useState<string>(tratamiento.seccionId ?? '')
  const [saving, setSaving] = useState(false)

  async function guardar() {
    setSaving(true)
    const body: Record<string, unknown> = {
      estado,
      notas: notas || null,
      diente: seleccion.piezas[0] ?? null,
      cara: seleccion.zona ?? null,
      seccionId: seccionId || null,
    }
    if (permisos.puedeModificarPrecio) body.precio = Number(precio)
    if (permisos.puedeAplicarDescuento) body.descuento = Number(descuento) || 0

    const res = await fetch(`/api/tratamientos/${tratamiento.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (res.ok) onSaved()
    else alert((await res.json()).error ?? 'Error')
  }

  async function eliminar() {
    if (!confirm('¿Eliminar esta acción?')) return
    await fetch(`/api/tratamientos/${tratamiento.id}`, { method: 'DELETE' })
    onDeleted()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none overflow-auto">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl pointer-events-auto max-h-[95vh] overflow-auto">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <h3 className="font-semibold text-slate-900">{tratamiento.prestacion.nombre}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Editar acción del plan</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium text-slate-700 mb-3">Pieza o zona</p>
              <OdontogramaSelector
                dientes={dientesExistentes}
                seleccion={seleccion}
                onChange={setSeleccion}
              />
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Estado</label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="PLANIFICADO">Planificado</option>
                  <option value="EN_PROGRESO">En progreso</option>
                  <option value="COMPLETADO">Completado</option>
                </select>
              </div>

              {secciones.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Sección</label>
                  <select
                    value={seccionId}
                    onChange={(e) => setSeccionId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">Sin sección</option>
                    {secciones.map((s) => (
                      <option key={s.id} value={s.id}>{s.titulo}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Precio {!permisos.puedeModificarPrecio && <span className="text-xs text-slate-400">(sin permiso para modificar)</span>}
                </label>
                <input
                  type="number"
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                  disabled={!permisos.puedeModificarPrecio}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Descuento (%) {!permisos.puedeAplicarDescuento && <span className="text-xs text-slate-400">(sin permiso)</span>}
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={descuento}
                  onChange={(e) => setDescuento(e.target.value)}
                  disabled={!permisos.puedeAplicarDescuento}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notas</label>
                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-2 sticky bottom-0 bg-white">
            <button onClick={eliminar} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
              Eliminar
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button
                onClick={guardar}
                disabled={saving}
                className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-lg font-semibold"
              >
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
