import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PacienteDTO } from '@shared/types'
import { pacientesService } from '@/services/clinica.service'

export function Pacientes() {
  const [pacientes, setPacientes] = useState<PacienteDTO[]>([])
  const [q, setQ] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => {
      pacientesService.listar(q).then(setPacientes).finally(() => setCargando(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Pacientes</h1>
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
