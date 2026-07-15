import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PacienteDTO, PacienteRecall } from '@shared/types'
import { pacientesService, pacientesIO, type ImportResultado } from '@/services/clinica.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

type Tab = 'todos' | 'recall'
const fechaCorta = (iso: string) => new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
const waLink = (tel?: string | null) => { const n = (tel ?? '').replace(/\D/g, ''); return n.length >= 8 ? `https://wa.me/${n}` : null }

export function Pacientes() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<Tab>('todos')
  const [pacientes, setPacientes] = useState<PacienteDTO[]>([])
  const [recall, setRecall] = useState<PacienteRecall[]>([])
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [io, setIo] = useState<{ tipo: 'export' | 'plantilla' | 'import' | null; error?: string }>({ tipo: null })
  const [resultado, setResultado] = useState<ImportResultado | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function cargar() {
    setCargando(true)
    if (tab === 'recall') {
      pacientesService.sinProximaCita(q.trim() || undefined, page, pageSize)
        .then((r) => { setRecall(r.items); setTotal(r.total) })
        .finally(() => setCargando(false))
    } else {
      pacientesService.listarPaginado(q.trim() || undefined, page, pageSize)
        .then((r) => { setPacientes(r.items); setTotal(r.total) })
        .finally(() => setCargando(false))
    }
  }
  useEffect(() => {
    const t = setTimeout(cargar, 250)
    return () => clearTimeout(t)
  }, [q, page, pageSize, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  function cambiarTab(t: Tab) { setTab(t); setPage(1) }

  async function descarga(tipo: 'export' | 'plantilla') {
    setIo({ tipo }); setResultado(null)
    try { await (tipo === 'export' ? pacientesIO.exportar() : pacientesIO.plantilla()) }
    catch (e) { setIo({ tipo: null, error: e instanceof ApiError ? e.message : 'Error al descargar' }); return }
    setIo({ tipo: null })
  }

  async function importar(file: File) {
    setIo({ tipo: 'import' }); setResultado(null)
    try {
      const r = await pacientesIO.importar(file)
      setResultado(r); setIo({ tipo: null })
      if (r.creados > 0) cargar()
    } catch (e) { setIo({ tipo: null, error: e instanceof ApiError ? e.message : 'Error al importar' }) }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Pacientes</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => descarga('export')} disabled={io.tipo !== null} className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-sm rounded-xl">
            {io.tipo === 'export' ? 'Exportando…' : 'Exportar XLSX'}
          </button>
          {esAdmin && (
            <>
              <button onClick={() => descarga('plantilla')} disabled={io.tipo !== null} className="px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 text-sm rounded-xl">Plantilla</button>
              <button onClick={() => fileRef.current?.click()} disabled={io.tipo !== null} className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl">
                {io.tipo === 'import' ? 'Importando…' : 'Importar'}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f) }} />
            </>
          )}
        </div>
      </div>

      {io.error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">{io.error}</p>}
      {resultado && (
        <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-3">
          <p className="text-emerald-800 font-medium">Importación: {resultado.creados} creados · {resultado.duplicados} duplicados · {resultado.total} filas leídas.</p>
          {resultado.errores.length > 0 && (
            <details className="mt-1">
              <summary className="text-rose-600 cursor-pointer">{resultado.errores.length} fila(s) con error</summary>
              <ul className="mt-1 text-xs text-rose-600 list-disc pl-5">
                {resultado.errores.slice(0, 20).map((er, i) => <li key={i}>Fila {er.fila}: {er.motivo}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Pestañas */}
      <div className="flex gap-1 mb-4 border-b border-slate-200">
        <button onClick={() => cambiarTab('todos')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'todos' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Todos
        </button>
        <button onClick={() => cambiarTab('recall')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === 'recall' ? 'border-cyan-600 text-cyan-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
          Sin próxima cita
        </button>
      </div>

      {tab === 'recall' && (
        <p className="text-sm text-slate-500 mb-4">Pacientes que asistieron o tuvieron una cita en el pasado y <span className="font-medium">no tienen ninguna cita futura agendada</span>. Contáctalos para reagendar. Ordenados por su última cita (más reciente primero).</p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Buscar por nombre o RUT…"
          className="flex-1 min-w-[16rem] max-w-md px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <label className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap">
          Ver
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
            className="px-2 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          por página
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? (
          <p className="px-5 py-10 text-center text-slate-500 text-sm">Cargando…</p>
        ) : tab === 'recall' ? (
          recall.length === 0 ? (
            <p className="px-5 py-10 text-center text-slate-500 text-sm">{q ? 'Ningún paciente coincide con la búsqueda.' : 'No hay pacientes sin próxima cita. ¡Todos tienen su hora agendada!'}</p>
          ) : recall.map((it) => {
            const p = it.paciente
            const wa = waLink(p.telefono)
            const dias = diasDesde(it.ultimaCita)
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                <Link to={`/pacientes/${p.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold text-cyan-800 flex items-center gap-2 flex-wrap">
                    {p.nombre} {p.apellido}
                    {it.asistio
                      ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Asistió</span>
                      : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">Sin asistencia</span>}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">{p.rut ?? 'Sin RUT'}{p.telefono ? ` · ${p.telefono}` : ''}</p>
                  <p className="text-[11px] text-slate-400">Última cita {fechaCorta(it.ultimaCita)} · hace {dias} día{dias === 1 ? '' : 's'} · {it.totalCitas} cita{it.totalCitas === 1 ? '' : 's'}</p>
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="px-3 py-1.5 border border-emerald-200 text-emerald-600 hover:bg-emerald-50 text-xs font-semibold rounded-lg">WhatsApp</a>}
                  <Link to={`/pacientes/${p.id}`} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold rounded-lg">Ver ficha</Link>
                </div>
              </div>
            )
          })
        ) : pacientes.length === 0 ? (
          <p className="px-5 py-10 text-center text-slate-500 text-sm">Sin pacientes.</p>
        ) : (
          pacientes.map((p) => (
            <Link key={p.id} to={`/pacientes/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
              <div>
                <p className="font-semibold text-cyan-800">{p.nombre} {p.apellido}</p>
                <p className="text-xs text-slate-500 font-mono">{p.rut ?? 'Sin RUT'}{p.telefono ? ` · ${p.telefono}` : ''}</p>
              </div>
              {p.prevision && <span className="text-xs text-slate-500">{p.prevision}</span>}
            </Link>
          ))
        )}
      </div>

      {!cargando && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-slate-600">
          <span>{total.toLocaleString('es-CL')} paciente{total === 1 ? '' : 's'} · página {page} de {totalPages}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Anterior</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">Siguiente</button>
          </div>
        </div>
      )}
    </div>
  )
}
