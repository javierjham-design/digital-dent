'use client'

import { useMemo, useState } from 'react'

type Doctor = { id: string; name: string }

type FiltroTipo = 'rangoFechas' | 'periodo' | 'estadoCita' | 'estadoCobro' | 'estadoTratamiento' | 'doctor' | 'diasMora' | 'campoFechaCobro' | 'campoFechaTratamiento' | 'soloActivos'

type Reporte = {
  id: string
  categoria: string
  nombre: string
  descripcion: string
  endpoint: string
  filtros: FiltroTipo[]
}

const CATEGORIAS = ['Todos', 'Pacientes', 'Agenda', 'Finanzas', 'Tratamientos', 'Liquidaciones'] as const

const REPORTES: Reporte[] = [
  {
    id: 'pacientes',
    categoria: 'Pacientes',
    nombre: 'Listado de pacientes',
    descripcion: 'Listado completo de pacientes con datos personales, contacto y previsión.',
    endpoint: '/api/reportes/pacientes',
    filtros: ['rangoFechas', 'soloActivos'],
  },
  {
    id: 'morosos',
    categoria: 'Pacientes',
    nombre: 'Pacientes morosos',
    descripcion: 'Pacientes con cobros pendientes, ordenados por días de mora.',
    endpoint: '/api/reportes/morosos',
    filtros: ['diasMora'],
  },
  {
    id: 'citas',
    categoria: 'Agenda',
    nombre: 'Citas agendadas',
    descripcion: 'Listado de citas en un rango de fechas, con paciente, doctor y estado.',
    endpoint: '/api/reportes/citas',
    filtros: ['rangoFechas', 'estadoCita'],
  },
  {
    id: 'cobros',
    categoria: 'Finanzas',
    nombre: 'Cobros',
    descripcion: 'Cobros emitidos o pagados en el periodo, con medio de pago y comisión.',
    endpoint: '/api/reportes/cobros',
    filtros: ['rangoFechas', 'campoFechaCobro', 'estadoCobro'],
  },
  {
    id: 'tratamientos',
    categoria: 'Tratamientos',
    nombre: 'Tratamientos',
    descripcion: 'Tratamientos planificados o completados, con paciente, doctor y prestación.',
    endpoint: '/api/reportes/tratamientos',
    filtros: ['rangoFechas', 'campoFechaTratamiento', 'estadoTratamiento', 'doctor'],
  },
  {
    id: 'liquidaciones',
    categoria: 'Liquidaciones',
    nombre: 'Liquidaciones de doctores',
    descripcion: 'Liquidaciones por periodo y doctor, con total bruto y liquidado.',
    endpoint: '/api/reportes/liquidaciones',
    filtros: ['periodo', 'doctor'],
  },
]

type FiltroValores = {
  desde: string
  hasta: string
  periodo: string
  estado: string
  doctorId: string
  diasMin: string
  campo: string
  soloActivos: boolean
}

const initialFiltros: FiltroValores = {
  desde: '',
  hasta: '',
  periodo: '',
  estado: '',
  doctorId: '',
  diasMin: '0',
  campo: '',
  soloActivos: false,
}

export function ReportesClient({ doctores }: { doctores: Doctor[] }) {
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]>('Todos')
  const [busqueda, setBusqueda] = useState('')
  const [seleccionado, setSeleccionado] = useState<Reporte | null>(null)
  const [filtros, setFiltros] = useState<FiltroValores>(initialFiltros)
  const [descargando, setDescargando] = useState(false)
  const [error, setError] = useState('')

  const listados = useMemo(() => {
    let r = REPORTES
    if (categoria !== 'Todos') r = r.filter((x) => x.categoria === categoria)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter((x) => x.nombre.toLowerCase().includes(q) || x.descripcion.toLowerCase().includes(q))
    }
    return r
  }, [categoria, busqueda])

  function abrir(r: Reporte) {
    setSeleccionado(r)
    setFiltros(initialFiltros)
    setError('')
  }

  function buildUrl(r: Reporte): string {
    const params = new URLSearchParams()
    if (r.filtros.includes('rangoFechas')) {
      if (filtros.desde) params.set('desde', filtros.desde)
      if (filtros.hasta) params.set('hasta', filtros.hasta)
    }
    if (r.filtros.includes('periodo') && filtros.periodo) params.set('periodo', filtros.periodo)
    if ((r.filtros.includes('estadoCita') || r.filtros.includes('estadoCobro') || r.filtros.includes('estadoTratamiento')) && filtros.estado) {
      params.set('estado', filtros.estado)
    }
    if (r.filtros.includes('doctor') && filtros.doctorId) params.set('doctorId', filtros.doctorId)
    if (r.filtros.includes('diasMora')) params.set('diasMin', filtros.diasMin || '0')
    if ((r.filtros.includes('campoFechaCobro') || r.filtros.includes('campoFechaTratamiento')) && filtros.campo) {
      params.set('campo', filtros.campo)
    }
    if (r.filtros.includes('soloActivos') && filtros.soloActivos) params.set('soloActivos', '1')
    const qs = params.toString()
    return qs ? `${r.endpoint}?${qs}` : r.endpoint
  }

  async function descargar() {
    if (!seleccionado) return
    setError('')
    setDescargando(true)
    try {
      const url = buildUrl(seleccionado)
      const res = await fetch(url)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Error ${res.status}`)
      }
      const blob = await res.blob()
      const filename = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1]
        ?? `${seleccionado.id}.xlsx`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    } catch (e: any) {
      setError(e.message ?? 'Error al descargar')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Reportes
        </h1>
        <p className="text-sm text-slate-500 mt-1">Descarga datos de tu clínica en Excel (.xlsx).</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
          {/* Sidebar categorías */}
          <aside className="border-b md:border-b-0 md:border-r border-slate-100 p-4 bg-slate-50/50">
            <p className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-semibold">Categorías</p>
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              {CATEGORIAS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoria(c)}
                  className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    categoria === c
                      ? 'bg-cyan-100 text-cyan-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {c}
                </button>
              ))}
            </nav>
          </aside>

          {/* Lista */}
          <div className="p-4">
            <div className="mb-4 relative">
              <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar reporte..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="divide-y divide-slate-100">
              {listados.length === 0 ? (
                <p className="text-sm text-slate-400 py-8 text-center">Sin reportes que coincidan.</p>
              ) : (
                listados.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => abrir(r)}
                    className="w-full text-left py-3 px-2 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900 group-hover:text-cyan-700">{r.nombre}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.descripcion}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-cyan-600 flex-shrink-0 ml-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {seleccionado && (
        <ModalFiltros
          reporte={seleccionado}
          doctores={doctores}
          filtros={filtros}
          setFiltros={setFiltros}
          onClose={() => setSeleccionado(null)}
          onDescargar={descargar}
          descargando={descargando}
          error={error}
        />
      )}
    </div>
  )
}

function ModalFiltros({
  reporte,
  doctores,
  filtros,
  setFiltros,
  onClose,
  onDescargar,
  descargando,
  error,
}: {
  reporte: Reporte
  doctores: Doctor[]
  filtros: FiltroValores
  setFiltros: (f: FiltroValores) => void
  onClose: () => void
  onDescargar: () => void
  descargando: boolean
  error: string
}) {
  const upd = (k: keyof FiltroValores, v: string | boolean) => setFiltros({ ...filtros, [k]: v as never })

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">{reporte.nombre}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{reporte.descripcion}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-5 space-y-4">
            {reporte.filtros.includes('rangoFechas') && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Desde">
                  <input type="date" value={filtros.desde} onChange={(e) => upd('desde', e.target.value)} className="input" />
                </Field>
                <Field label="Hasta">
                  <input type="date" value={filtros.hasta} onChange={(e) => upd('hasta', e.target.value)} className="input" />
                </Field>
              </div>
            )}

            {reporte.filtros.includes('campoFechaCobro') && (
              <Field label="Filtrar por">
                <select value={filtros.campo} onChange={(e) => upd('campo', e.target.value)} className="input">
                  <option value="">Fecha de creación</option>
                  <option value="fechaPago">Fecha de pago</option>
                </select>
              </Field>
            )}

            {reporte.filtros.includes('campoFechaTratamiento') && (
              <Field label="Filtrar por">
                <select value={filtros.campo} onChange={(e) => upd('campo', e.target.value)} className="input">
                  <option value="">Fecha planificada</option>
                  <option value="fechaCompletado">Fecha completado</option>
                </select>
              </Field>
            )}

            {reporte.filtros.includes('periodo') && (
              <Field label="Periodo (YYYY-MM)" hint="Vacío = todos los periodos">
                <input type="month" value={filtros.periodo} onChange={(e) => upd('periodo', e.target.value)} className="input" />
              </Field>
            )}

            {reporte.filtros.includes('estadoCita') && (
              <Field label="Estado">
                <select value={filtros.estado} onChange={(e) => upd('estado', e.target.value)} className="input">
                  <option value="">Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="CONFIRMADA">Confirmada</option>
                  <option value="EN_ATENCION">En atención</option>
                  <option value="ATENDIDA">Atendida</option>
                  <option value="CANCELADA">Cancelada</option>
                  <option value="NO_ASISTIO">No asistió</option>
                </select>
              </Field>
            )}

            {reporte.filtros.includes('estadoCobro') && (
              <Field label="Estado">
                <select value={filtros.estado} onChange={(e) => upd('estado', e.target.value)} className="input">
                  <option value="">Todos</option>
                  <option value="PENDIENTE">Pendiente</option>
                  <option value="PAGADO">Pagado</option>
                  <option value="ANULADO">Anulado</option>
                </select>
              </Field>
            )}

            {reporte.filtros.includes('estadoTratamiento') && (
              <Field label="Estado">
                <select value={filtros.estado} onChange={(e) => upd('estado', e.target.value)} className="input">
                  <option value="">Todos</option>
                  <option value="PLANIFICADO">Planificado</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="COMPLETADO">Completado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
              </Field>
            )}

            {reporte.filtros.includes('doctor') && (
              <Field label="Doctor">
                <select value={filtros.doctorId} onChange={(e) => upd('doctorId', e.target.value)} className="input">
                  <option value="">Todos los doctores</option>
                  {doctores.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </Field>
            )}

            {reporte.filtros.includes('diasMora') && (
              <Field label="Días de mora mínimos" hint="0 = todos los pendientes">
                <input type="number" min={0} value={filtros.diasMin} onChange={(e) => upd('diasMin', e.target.value)} className="input" />
              </Field>
            )}

            {reporte.filtros.includes('soloActivos') && (
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filtros.soloActivos}
                  onChange={(e) => upd('soloActivos', e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-600"
                />
                Solo pacientes activos
              </label>
            )}

            {reporte.filtros.length === 0 && (
              <p className="text-sm text-slate-500">Este reporte no requiere filtros.</p>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</p>}
          </div>

          <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancelar
            </button>
            <button
              onClick={onDescargar}
              disabled={descargando}
              className="px-4 py-2 text-sm font-semibold bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-lg flex items-center gap-2"
            >
              {descargando ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Descargar Excel
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          background: white;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgb(8 145 178);
          box-shadow: 0 0 0 2px rgb(8 145 178 / 0.2);
        }
      `}</style>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider text-slate-500 mb-1 font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
