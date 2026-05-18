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

type CobroItemMin = {
  id: string
  monto: number
  cobro: { id: string; numero: number; estado: string; fechaPago: string | null }
}

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
  cobroItems?: CobroItemMin[]
}

type EstadoCobro = 'PAGADO' | 'FACTURADO' | 'SIN_FACTURAR'
function estadoCobro(t: Tratamiento): EstadoCobro {
  const items = t.cobroItems ?? []
  if (items.length === 0) return 'SIN_FACTURAR'
  if (items.some((i) => i.cobro.estado === 'PAGADO')) return 'PAGADO'
  if (items.some((i) => i.cobro.estado === 'PENDIENTE')) return 'FACTURADO'
  return 'SIN_FACTURAR'
}

function esDeuda(t: Tratamiento): boolean {
  return t.estado === 'COMPLETADO' && estadoCobro(t) !== 'PAGADO'
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
  puedeRevertirCompletado: boolean
}

type Doctor = { id: string; name: string | null; email: string | null }

type Props = {
  pacienteId: string
  prestaciones: Prestacion[]
  doctors: Doctor[]
  dientesExistentes?: { numero: number; estadoActual?: string }[]
  permisos: Permisos
}

function subtotal(t: Tratamiento): number {
  return t.precio * (1 - (t.descuento || 0) / 100)
}

export function PlanesTratamiento({ pacienteId, prestaciones, doctors, dientesExistentes = [], permisos }: Props) {
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
        doctors={doctors}
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

function ResumenEconomico({ resumen }: { resumen: { total: number; realizado: number; pagado: number; facturado: number; deuda: number; porCobrar: number } }) {
  const { total, realizado, pagado, facturado, deuda, porCobrar } = resumen
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <h4 className="font-semibold text-slate-900 text-sm">Resumen económico del plan</h4>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-slate-100">
        <Metric label="Total plan" value={total} cls="text-slate-900" />
        <Metric label="Realizado" value={realizado} cls="text-slate-700" hint={`${total > 0 ? Math.round((realizado / total) * 100) : 0}%`} />
        <Metric label="Pagado" value={pagado} cls="text-emerald-700" />
        <Metric label="Facturado" value={facturado} cls="text-amber-700" hint="Cobro emitido, sin pago" />
        <Metric
          label="Deuda"
          value={deuda}
          cls={deuda > 0 ? 'text-red-600' : 'text-slate-400'}
          hint={deuda > 0 ? 'Completado sin cobrar' : 'Sin deuda'}
        />
      </div>
      {(porCobrar > 0 || deuda > 0) && (
        <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
          <span>Total por cobrar (facturado + deuda):</span>
          <span className="font-bold text-amber-700">{formatCLP(porCobrar)}</span>
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, cls, hint }: { label: string; value: number; cls: string; hint?: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xs uppercase tracking-wider text-slate-500 mb-0.5 font-medium">{label}</p>
      <p className={`text-base md:text-lg font-bold leading-tight ${cls}`}>{formatCLP(value)}</p>
      {hint && <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{hint}</p>}
    </div>
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
  plan, prestaciones, doctors, dientesExistentes, permisos, pacienteId, onBack, onChanged, onDelete,
}: {
  plan: Plan
  prestaciones: Prestacion[]
  doctors: Doctor[]
  dientesExistentes: { numero: number; estadoActual?: string }[]
  permisos: Permisos
  pacienteId: string
  onBack: () => void
  onChanged: () => void
  onDelete: () => void
}) {
  // Sección destino preferida para el próximo "agregar acción" (sticky entre adds).
  const [seccionDestino, setSeccionDestino] = useState<string>('')

  const secciones = plan.secciones ?? []

  const todosTratamientos = useMemo(
    () => [...(plan.tratamientos ?? []), ...secciones.flatMap((s) => s.tratamientos)],
    [plan, secciones],
  )

  const resumen = useMemo(() => {
    let total = 0
    let realizado = 0
    let pagado = 0
    let facturado = 0
    let deuda = 0
    for (const t of todosTratamientos) {
      const monto = subtotal(t)
      total += monto
      if (t.estado === 'COMPLETADO') {
        realizado += monto
        const ec = estadoCobro(t)
        if (ec === 'PAGADO') pagado += monto
        else if (ec === 'FACTURADO') facturado += monto
        else deuda += monto
      }
    }
    return { total, realizado, pagado, facturado, deuda, porCobrar: facturado + deuda }
  }, [todosTratamientos])

  const totalGeneral = resumen.total

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

      {/* RESUMEN ECONÓMICO */}
      <ResumenEconomico resumen={resumen} />

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
            doctors={doctors}
            permisos={permisos}
            pacienteId={pacienteId}
            onChanged={onChanged}
          />
        )}

        {secciones.map((s) => (
          <SeccionItem
            key={s.id}
            seccion={s}
            doctors={doctors}
            permisos={permisos}
            pacienteId={pacienteId}
            onChanged={onChanged}
          />
        ))}

        {secciones.length === 0 && (plan.tratamientos ?? []).length === 0 && (
          <p className="text-sm text-slate-400 text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
            Aún no hay acciones. Agrega la primera con el formulario de arriba.
          </p>
        )}
      </div>
    </div>
  )
}

function SeccionItem({ seccion, doctors, permisos, pacienteId, onChanged }: {
  seccion: Seccion
  doctors: Doctor[]
  permisos: Permisos
  pacienteId: string
  onChanged: () => void
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
      doctors={doctors}
      permisos={permisos}
      pacienteId={pacienteId}
      onChanged={onChanged}
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
  titulo, subtitle, tratamientos, doctors, permisos, pacienteId, onChanged, onEditarSeccion, onEliminarSeccion, children,
}: {
  titulo: string
  subtitle?: string
  tratamientos: Tratamiento[]
  doctors: Doctor[]
  permisos: Permisos
  pacienteId: string
  onChanged: () => void
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
        <>
          <div className="hidden md:grid px-5 py-2 grid-cols-12 gap-2 text-xs uppercase tracking-wider text-slate-500 font-medium border-b border-slate-100 bg-slate-50">
            <div className="col-span-4">Prestación</div>
            <div className="col-span-2">Doctor</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-1 text-right">Precio</div>
            <div className="col-span-1 text-right">Desc%</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1"></div>
          </div>
          <div className="divide-y divide-slate-100">
            {tratamientos.map((t) => (
              <FilaTratamiento
                key={t.id}
                tratamiento={t}
                doctors={doctors}
                permisos={permisos}
                pacienteId={pacienteId}
                onChanged={onChanged}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-400 text-center py-6">Sin acciones aún.</p>
      )}

      {children}
    </div>
  )
}

function FilaTratamiento({
  tratamiento: t, doctors, permisos, pacienteId, onChanged,
}: {
  tratamiento: Tratamiento
  doctors: Doctor[]
  permisos: Permisos
  pacienteId: string
  onChanged: () => void
}) {
  const [doctorId, setDoctorId] = useState(t.doctor?.id ?? '')
  const [estado, setEstado] = useState(t.estado)
  const [precio, setPrecio] = useState(t.precio.toString())
  const [descuento, setDescuento] = useState(t.descuento.toString())
  const [saving, setSaving] = useState(false)
  const [promptEvolucion, setPromptEvolucion] = useState(false)

  async function patch(data: Record<string, unknown>): Promise<boolean> {
    setSaving(true)
    try {
      const r = await fetch(`/api/tratamientos/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        alert(err.error ?? 'Error guardando')
        return false
      }
      onChanged()
      return true
    } finally {
      setSaving(false)
    }
  }

  async function cambiarEstado(nuevo: string) {
    // Si está saliendo de COMPLETADO, confirmación + permiso
    if (t.estado === 'COMPLETADO' && nuevo !== 'COMPLETADO') {
      if (!permisos.puedeRevertirCompletado) {
        alert('No tienes permisos para revertir una acción ya completada.')
        return
      }
      if (!confirm('¿Estás seguro de revertir esta acción? Ya estaba marcada como completada.')) {
        return
      }
    }
    setEstado(nuevo)
    const data: Record<string, unknown> = { estado: nuevo }
    if (nuevo === 'COMPLETADO') data.fechaCompletado = new Date().toISOString()
    else data.fechaCompletado = null

    const ok = await patch(data)
    if (ok && nuevo === 'COMPLETADO' && t.estado !== 'COMPLETADO') {
      setPromptEvolucion(true)
    }
  }

  function cambiarDoctor(nuevo: string) {
    setDoctorId(nuevo)
    patch({ doctorId: nuevo || null })
  }

  function blurPrecio() {
    const p = Number(precio)
    if (Number.isFinite(p) && p !== t.precio) patch({ precio: p })
    else setPrecio(t.precio.toString())
  }

  function blurDescuento() {
    const d = Number(descuento) || 0
    const clamped = Math.max(0, Math.min(100, d))
    if (clamped !== t.descuento) patch({ descuento: clamped })
    else setDescuento(t.descuento.toString())
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar "${t.prestacion.nombre}"?`)) return
    setSaving(true)
    await fetch(`/api/tratamientos/${t.id}`, { method: 'DELETE' })
    onChanged()
  }

  const completado = estado === 'COMPLETADO'
  const ec = estadoCobro(t)
  const deuda = completado && ec !== 'PAGADO'
  const filaCls = deuda
    ? 'bg-red-50 hover:bg-red-100/60 border-l-4 border-red-500'
    : completado
      ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
      : 'hover:bg-slate-50/60'

  return (
    <>
    {promptEvolucion && (
      <ModalEvolucion
        pacienteId={pacienteId}
        tratamientoId={t.id}
        prestacionNombre={t.prestacion.nombre}
        onClose={() => setPromptEvolucion(false)}
        onSaved={() => { setPromptEvolucion(false); onChanged() }}
      />
    )}
    <div className={`px-5 py-2.5 grid grid-cols-1 md:grid-cols-12 gap-2 items-center ${filaCls} ${saving ? 'opacity-60' : ''}`}>
      <div className="md:col-span-4 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-slate-900 truncate flex-1">{t.prestacion.nombre || <span className="italic text-slate-400">Sin nombre</span>}</p>
          {deuda && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wider flex-shrink-0">
              DEUDA
            </span>
          )}
          {completado && ec === 'PAGADO' && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white tracking-wider flex-shrink-0">
              PAGADO
            </span>
          )}
          {completado && ec === 'FACTURADO' && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white tracking-wider flex-shrink-0" title="Cobro emitido, esperando pago">
              FACTURADO
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 truncate">
          {t.diente ? `Pieza ${t.diente}` : t.cara ?? 'General'}
          {t.notas && ` · ${t.notas}`}
        </p>
      </div>
      <div className="md:col-span-2">
        <select
          value={doctorId}
          onChange={(e) => cambiarDoctor(e.target.value)}
          className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 bg-white"
        >
          <option value="">Sin doctor</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>{d.name || d.email || 'Sin nombre'}</option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <select
          value={estado}
          onChange={(e) => cambiarEstado(e.target.value)}
          className={`w-full px-2 py-1 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-cyan-500 font-medium ${ESTADO_STYLES[estado]?.cls ?? 'bg-slate-100 text-slate-600'}`}
        >
          <option value="PLANIFICADO">Planificado</option>
          <option value="EN_PROGRESO">En progreso</option>
          <option value="COMPLETADO">Completado ✓</option>
        </select>
      </div>
      <div className="md:col-span-1">
        <input
          type="number"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          onBlur={blurPrecio}
          disabled={!permisos.puedeModificarPrecio}
          title={permisos.puedeModificarPrecio ? 'Editar precio' : 'Sin permiso para modificar precio'}
          className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>
      <div className="md:col-span-1">
        <input
          type="number"
          min={0}
          max={100}
          value={descuento}
          onChange={(e) => setDescuento(e.target.value)}
          onBlur={blurDescuento}
          disabled={!permisos.puedeAplicarDescuento}
          title={permisos.puedeAplicarDescuento ? 'Aplicar descuento (%)' : 'Sin permiso para aplicar descuento'}
          className="w-full px-2 py-1 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-500"
        />
      </div>
      <div className="md:col-span-1 text-right">
        <p className="text-sm font-bold text-slate-900">{formatCLP(subtotal(t))}</p>
        {t.descuento > 0 && <p className="text-xs text-emerald-600 leading-tight">-{t.descuento}%</p>}
      </div>
      <div className="md:col-span-1 flex justify-end">
        <button
          onClick={eliminar}
          title="Eliminar acción"
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
          </svg>
        </button>
      </div>
    </div>
    </>
  )
}

function ModalEvolucion({
  pacienteId, tratamientoId, prestacionNombre, onClose, onSaved,
}: {
  pacienteId: string
  tratamientoId: string
  prestacionNombre: string
  onClose: () => void
  onSaved: () => void
}) {
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)

  async function guardar() {
    if (!texto.trim()) {
      onSaved() // anotar es opcional, salir sin guardar
      return
    }
    setSaving(true)
    const r = await fetch('/api/evoluciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacienteId, tratamientoId, texto: texto.trim() }),
    })
    setSaving(false)
    if (r.ok) onSaved()
    else {
      const e = await r.json().catch(() => ({}))
      alert(e.error ?? 'Error al guardar evolución')
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-emerald-100 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-semibold text-slate-900">Acción completada</h3>
            </div>
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-700">{prestacionNombre}</span> · Si quieres, anota la evolución de lo realizado.
            </p>
          </div>
          <div className="p-5">
            <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">
              Evolución (opcional)
            </label>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={5}
              placeholder="Ej: Se realizó endodoncia en pieza 16, sin complicaciones..."
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              autoFocus
            />
            <p className="text-xs text-slate-400 mt-2">
              Quedará registrada con tu nombre y fecha en el historial del paciente.
            </p>
          </div>
          <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={onSaved} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Saltar
            </button>
            <button
              onClick={guardar}
              disabled={saving}
              className="px-4 py-2 text-sm bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-lg font-semibold"
            >
              {saving ? 'Guardando...' : 'Guardar evolución'}
            </button>
          </div>
        </div>
      </div>
    </>
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

