import { useEffect, useState } from 'react'
import type { CitaDTO } from '@shared/types'
import { CITA_ESTADOS, siguienteEstado } from '@shared/constants/cita-estados'
import { citasService } from '@/services/clinica.service'

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function Agenda() {
  const [citas, setCitas] = useState<CitaDTO[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  function cargar() {
    const hoy = new Date()
    const from = new Date(hoy); from.setHours(0, 0, 0, 0)
    const to = new Date(hoy); to.setHours(23, 59, 59, 999)
    citasService.listar(from.toISOString(), to.toISOString())
      .then(setCitas)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }
  useEffect(cargar, [])

  async function avanzar(c: CitaDTO) {
    const next = siguienteEstado(c.estado)
    if (!next) return
    await citasService.cambiarEstado(c.id, next.estado)
    cargar()
  }

  if (cargando) return <p className="text-slate-500 text-sm">Cargando agenda…</p>
  if (error) return <p className="text-rose-600 text-sm">{error}</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Agenda de hoy</h1>
      <p className="text-slate-500 text-sm mb-6">{citas.length} cita{citas.length === 1 ? '' : 's'}</p>

      {citas.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
          Sin citas para hoy.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {citas.map((c) => {
            const cfg = CITA_ESTADOS[c.estado]
            const next = siguienteEstado(c.estado)
            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex flex-col items-center rounded-lg px-2 py-1" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>
                  <span className="font-mono text-[13px] font-bold">{hora(c.inicio)}</span>
                  <span className="font-mono text-[11px] opacity-70">{hora(c.fin)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate">{c.pacienteNombre}</p>
                  <p className="text-xs text-slate-500">{c.doctor} · {c.tipo}</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: cfg?.bg, color: cfg?.text }}>
                  {cfg?.label ?? c.estado}
                </span>
                {next && (
                  <button onClick={() => avanzar(c)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100">
                    {next.accion}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
