'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatRUT, formatCLP } from '@/lib/utils'

interface Paciente {
  id: string
  numero: number
  rut: string | null
  nombre: string
  apellido: string
  telefono: string | null
  email: string | null
  prevision: string | null
  activo: boolean
  createdAt: string
}

type Resumen = {
  tratamientosCount: number
  activos: number; finalizados: number; expirados: number
  realizado: number; abonado: number; saldo: number
}

type ImportResult = {
  total: number
  creados: number
  duplicados: number
  sinRut?: number
  errores: { fila: number; motivo: string }[]
}

const PREVISION_COLORS: Record<string, string> = {
  FONASA: 'bg-emerald-100 text-emerald-700',
  ISAPRE: 'bg-blue-100 text-blue-700',
  PARTICULAR: 'bg-slate-100 text-slate-700',
}

const PAGE_SIZE = 50

export function PacientesClient({ pacientes }: { pacientes: Paciente[] }) {
  const [search, setSearch] = useState('')
  const [numero, setNumero] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resumenes, setResumenes] = useState<Record<string, Resumen>>({})
  const [loadingResumen, setLoadingResumen] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ rut: '', nombre: '', apellido: '', telefono: '', email: '', prevision: 'PARTICULAR', fechaNacimiento: '', genero: '' })
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const n = numero.trim()
    return pacientes.filter((p) => {
      if (q && !`${p.nombre} ${p.apellido} ${p.email ?? ''} ${p.rut ?? ''}`.toLowerCase().includes(q)) return false
      if (n && !String(p.numero).includes(n)) return false
      return true
    })
  }, [pacientes, search, numero])

  const visible = filtered.slice(0, visibleCount)

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [search, numero])

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (resumenes[id]) return
    setLoadingResumen(id)
    try {
      const res = await fetch(`/api/pacientes/${id}/resumen`)
      if (res.ok) {
        const data = await res.json()
        setResumenes((prev) => ({ ...prev, [id]: data }))
      }
    } finally {
      setLoadingResumen(null)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/pacientes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false); setShowModal(false); window.location.reload()
  }

  async function handleExport() {
    try {
      setExporting(true)
      const res = await fetch('/api/pacientes/export')
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `pacientes-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch (e: any) { alert(`No se pudo exportar: ${e.message ?? e}`) }
    finally { setExporting(false) }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportError(null); setImportResult(null); setImporting(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/pacientes/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) setImportError(data.error ?? `Error ${res.status}`)
      else setImportResult(data as ImportResult)
    } catch (err: any) { setImportError(err.message ?? 'Error desconocido') }
    finally { setImporting(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  function closeImportResult() {
    const debeRecargar = importResult && importResult.creados > 0
    setImportResult(null); setImportError(null)
    if (debeRecargar) window.location.reload()
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pacientes</h1>
          <p className="text-slate-500 text-sm mt-1">
            {pacientes.length} paciente{pacientes.length !== 1 ? 's' : ''} registrado{pacientes.length !== 1 ? 's' : ''}
            {filtered.length !== pacientes.length && ` · ${filtered.length} en filtro`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/api/pacientes/template" className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Plantilla
          </a>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            {importing ? 'Importando...' : 'Importar'}
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportFile} />
          <button onClick={handleExport} disabled={exporting || pacientes.length === 0}
            className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-60 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            {exporting ? 'Exportando...' : 'Exportar Excel'}
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Agregar paciente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="relative md:col-span-2">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input type="text" placeholder="Buscar por nombre, apellido, RUT o email..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>
        <input type="text" placeholder="N° paciente" value={numero} onChange={(e) => setNumero(e.target.value)}
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 bg-cyan-700 text-white text-xs font-semibold uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Nombre</div>
          <div className="col-span-4">Apellidos</div>
          <div className="col-span-2">Previsión</div>
          <div className="col-span-1 text-right">Acciones</div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-6 py-12 text-center text-slate-400 text-sm">
            {search || numero ? 'No se encontraron pacientes con esos filtros' : 'No hay pacientes registrados'}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {visible.map((p) => {
              const isOpen = expandedId === p.id
              const r = resumenes[p.id]
              const cargando = loadingResumen === p.id
              return (
                <div key={p.id}>
                  <button
                    onClick={() => toggleExpand(p.id)}
                    className={`w-full grid grid-cols-12 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors text-sm ${isOpen ? 'bg-cyan-50/40 border-l-4 border-cyan-500' : ''}`}
                  >
                    <div className="col-span-1 text-slate-500 font-mono">{p.numero || '—'}</div>
                    <div className="col-span-4 font-medium text-slate-800 truncate">{p.nombre}</div>
                    <div className="col-span-4 text-slate-700 truncate">{p.apellido}</div>
                    <div className="col-span-2">
                      {p.prevision
                        ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PREVISION_COLORS[p.prevision] ?? 'bg-slate-100 text-slate-700'}`}>{p.prevision}</span>
                        : <span className="text-slate-400 text-xs">—</span>}
                    </div>
                    <div className="col-span-1 flex justify-end items-center">
                      <Link href={`/pacientes/${p.id}`} onClick={(e) => e.stopPropagation()}
                        className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                      </Link>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-5 bg-cyan-50/30 border-b border-slate-100">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
                        {/* Avatar */}
                        <div className="flex items-start justify-center md:justify-start">
                          <div className="w-24 h-24 rounded-full bg-cyan-100 border-2 border-cyan-200 flex items-center justify-center text-cyan-700 text-3xl font-bold">
                            {p.nombre[0]}{p.apellido[0]}
                          </div>
                        </div>

                        {/* Contacto */}
                        <div className="text-sm space-y-1.5">
                          <p className="flex items-start gap-2 text-slate-700"><span className="text-slate-400 w-5">RUT</span>{p.rut ? formatRUT(p.rut) : <span className="text-slate-400">—</span>}</p>
                          <p className="flex items-start gap-2 text-slate-700"><span className="text-slate-400 w-5">@</span><span className="truncate">{p.email ?? '—'}</span></p>
                          <p className="flex items-start gap-2 text-slate-700"><span className="text-slate-400 w-5">☎</span>{p.telefono ?? '—'}</p>
                          <p className="flex items-start gap-2 text-slate-700">
                            <span className="text-slate-400 w-5">⎘</span>
                            {p.prevision
                              ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PREVISION_COLORS[p.prevision] ?? 'bg-slate-100 text-slate-700'}`}>{p.prevision}</span>
                              : <span className="text-slate-400">Sin convenio</span>}
                          </p>
                        </div>

                        {/* Tratamientos */}
                        <div className="text-sm">
                          {cargando ? (
                            <p className="text-slate-400 text-xs">Cargando...</p>
                          ) : r ? (
                            <>
                              <div className="flex justify-between mb-1.5"><span className="text-slate-500">Activos</span><span className="font-semibold text-slate-800">{r.activos}</span></div>
                              <div className="flex justify-between mb-1.5"><span className="text-slate-500">Finalizados</span><span className="font-semibold text-slate-800">{r.finalizados}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Expirados</span><span className="font-semibold text-slate-800">{r.expirados}</span></div>
                            </>
                          ) : <p className="text-slate-400 text-xs">—</p>}
                          <Link href={`/pacientes/${p.id}?tab=tratamientos`} onClick={(e) => e.stopPropagation()}
                            className="block mt-3 text-cyan-600 hover:text-cyan-700 text-xs font-medium">
                            Ir a tratamientos →
                          </Link>
                        </div>

                        {/* Recaudación */}
                        <div className="text-sm">
                          {cargando ? (
                            <p className="text-slate-400 text-xs">Cargando...</p>
                          ) : r ? (
                            <>
                              <div className="flex justify-between mb-1.5"><span className="text-slate-500">Realizado</span><span className="font-semibold text-slate-800">{formatCLP(r.realizado)}</span></div>
                              <div className="flex justify-between mb-1.5"><span className="text-slate-500">Abonado</span><span className="font-semibold text-slate-800">{formatCLP(r.abonado)}</span></div>
                              <div className="flex justify-between"><span className="text-slate-500">Saldo</span>
                                <span className={`font-semibold ${r.saldo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatCLP(r.saldo)}</span>
                              </div>
                            </>
                          ) : <p className="text-slate-400 text-xs">—</p>}
                          <Link href={`/pacientes/${p.id}?tab=cobros`} onClick={(e) => e.stopPropagation()}
                            className="block mt-3 text-cyan-600 hover:text-cyan-700 text-xs font-medium">
                            Ir a recaudación →
                          </Link>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-cyan-100 flex justify-end">
                        <Link href={`/pacientes/${p.id}`} className="text-sm text-cyan-700 hover:text-cyan-800 font-medium">
                          Ir a datos personales →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {filtered.length > visibleCount && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between text-sm">
            <span className="text-slate-500">
              Mostrando {visibleCount} de {filtered.length}
            </span>
            <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-medium">
              Cargar más
            </button>
          </div>
        )}
      </div>

      {/* Modal resultado importación */}
      {(importResult || importError) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{importError ? 'Error al importar' : 'Importación completada'}</h2>
              <button onClick={closeImportResult} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {importError ? (
                <p className="text-sm text-red-600">{importError}</p>
              ) : importResult ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-slate-900">{importResult.total}</p><p className="text-xs text-slate-500 mt-1">Filas leídas</p></div>
                    <div className="bg-emerald-50 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-emerald-700">{importResult.creados}</p><p className="text-xs text-emerald-600 mt-1">Creados</p></div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-amber-700">{importResult.duplicados}</p><p className="text-xs text-amber-600 mt-1">RUT ya existente</p></div>
                    <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-2xl font-bold text-slate-700">{importResult.sinRut ?? 0}</p><p className="text-xs text-slate-500 mt-1">Importados sin RUT</p></div>
                  </div>
                  {importResult.errores.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-slate-700 mb-2">Errores ({importResult.errores.length}):</p>
                      <div className="bg-red-50 border border-red-100 rounded-xl p-3 max-h-48 overflow-y-auto">
                        <ul className="text-xs text-red-700 space-y-1">
                          {importResult.errores.slice(0, 50).map((err, i) => (<li key={i}><span className="font-mono">Fila {err.fila}:</span> {err.motivo}</li>))}
                          {importResult.errores.length > 50 && (<li className="italic">...y {importResult.errores.length - 50} más</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
              <button onClick={closeImportResult} className="w-full px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo paciente */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Nuevo paciente</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre *</label>
                  <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Apellido *</label>
                  <input required value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RUT <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input placeholder="12345678-9" value={form.rut} onChange={(e) => setForm({ ...form, rut: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fecha nacimiento</label>
                  <input type="date" value={form.fechaNacimiento} onChange={(e) => setForm({ ...form, fechaNacimiento: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Género</label>
                  <select value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    <option value="">Seleccionar</option>
                    <option value="M">Masculino</option><option value="F">Femenino</option><option value="O">Otro</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Previsión</label>
                <select value={form.prevision} onChange={(e) => setForm({ ...form, prevision: e.target.value })} className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                  <option value="PARTICULAR">Particular</option><option value="FONASA">FONASA</option><option value="ISAPRE">ISAPRE</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white rounded-xl text-sm font-medium">{saving ? 'Guardando...' : 'Guardar paciente'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
