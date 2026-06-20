import { useEffect, useState } from 'react'
import type { PacienteDTO } from '@shared/types'
import { pacientesService } from '@/services/clinica.service'

// Selector de paciente con búsqueda EN EL SERVIDOR (a medida que se escribe).
// Reemplaza el patrón viejo de pre-cargar 500 pacientes y filtrar en cliente
// (que no encontraba a nadie más allá de los primeros 500). Sirve para los
// formularios de cita, presupuesto y cobro.
export function PacienteBuscador({ onSelect, placeholder = 'Buscar nombre o RUT…' }: {
  onSelect: (p: PacienteDTO | null) => void
  placeholder?: string
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<PacienteDTO[]>([])
  const [elegido, setElegido] = useState(false)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    if (elegido) return
    const term = search.trim()
    if (term.length < 2) { setResults([]); return }
    setBuscando(true)
    const t = setTimeout(() => {
      pacientesService.listar(term)
        .then((r) => setResults(r.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setBuscando(false))
    }, 250)
    return () => clearTimeout(t)
  }, [search, elegido])

  return (
    <div className="relative">
      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); if (elegido) { setElegido(false); onSelect(null) } }}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />
      {!elegido && results.length > 0 && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {results.map((p) => (
            <button key={p.id} type="button"
              onClick={() => { setElegido(true); setSearch(`${p.nombre} ${p.apellido}`); setResults([]); onSelect(p) }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0">
              <p className="text-sm font-medium text-slate-800">{p.nombre} {p.apellido}</p>
              <p className="text-xs text-slate-500 font-mono">{p.rut ?? 'Sin RUT'}</p>
            </button>
          ))}
        </div>
      )}
      {!elegido && search.trim().length >= 2 && !buscando && results.length === 0 && (
        <p className="text-xs text-slate-400 mt-1">Sin resultados.</p>
      )}
      {elegido && (
        <p className="text-xs text-cyan-700 mt-1">
          Paciente seleccionado ✓ ·{' '}
          <button type="button" className="underline" onClick={() => { setElegido(false); setSearch(''); setResults([]); onSelect(null) }}>cambiar</button>
        </p>
      )}
    </div>
  )
}
