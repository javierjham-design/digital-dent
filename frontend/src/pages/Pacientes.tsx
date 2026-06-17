import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PacienteDTO } from '@shared/types'
import { pacientesService, pacientesIO, type ImportResultado } from '@/services/clinica.service'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api'

export function Pacientes() {
  const { user } = useAuth()
  const esAdmin = user?.role === 'admin'
  const [pacientes, setPacientes] = useState<PacienteDTO[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)
  const [io, setIo] = useState<{ tipo: 'export' | 'plantilla' | 'import' | null; error?: string }>({ tipo: null })
  const [resultado, setResultado] = useState<ImportResultado | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function cargar() { pacientesService.listar(q).then(setPacientes).finally(() => setCargando(false)) }
  useEffect(() => {
    const t = setTimeout(cargar, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

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

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o RUT…"
        className="w-full max-w-md mb-4 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />

      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {cargando ? (
          <p className="px-5 py-10 text-center text-slate-500 text-sm">Cargando…</p>
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
    </div>
  )
}
