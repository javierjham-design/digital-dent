'use client'

import { useState } from 'react'

const ESTADO_COLORES: Record<string, string> = {
  SANO: '#ffffff',
  CARIES: '#ef4444',
  OBTURADO: '#3b82f6',
  AUSENTE: '#6b7280',
  CORONA: '#f59e0b',
  ENDODONCIA: '#8b5cf6',
  EXTRACCION: '#1f2937',
}

const DIENTES_SUPERIORES = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28]
const DIENTES_INFERIORES = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]

interface Props {
  fichaId?: string
  pacienteId: string
  dientes: { numero: number; estado: string; cara?: string | null }[]
}

export function Odontograma({ fichaId, pacienteId, dientes }: Props) {
  const [selected, setSelected] = useState<number | null>(null)
  const [estadoMap, setEstadoMap] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {}
    dientes.forEach((d) => { m[d.numero] = d.estado })
    return m
  })
  const [saving, setSaving] = useState(false)

  async function actualizarDiente(numero: number, estado: string) {
    setSaving(true)
    setEstadoMap((prev) => ({ ...prev, [numero]: estado }))
    await fetch('/api/odontograma', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pacienteId, fichaId, numero, estado }),
    })
    setSaving(false)
    setSelected(null)
  }

  function Diente({ numero }: { numero: number }) {
    const estado = estadoMap[numero] ?? 'SANO'
    const color = ESTADO_COLORES[estado] ?? '#fff'
    const isSelected = selected === numero
    return (
      <button
        onClick={() => setSelected(isSelected ? null : numero)}
        className="flex flex-col items-center gap-1 group"
        title={`Diente ${numero} - ${estado}`}
      >
        <span className="text-xs text-slate-400">{numero}</span>
        <div
          className={`w-7 h-7 rounded-lg border-2 transition-all ${isSelected ? 'border-cyan-500 shadow-md scale-110' : 'border-slate-300 group-hover:border-cyan-400'}`}
          style={{ backgroundColor: color }}
        />
        <span className="text-xs text-slate-300 truncate w-7 text-center" style={{ fontSize: '9px' }}>{estado.slice(0,3)}</span>
      </button>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-semibold text-slate-900">Odontograma</h3>
        {saving && <span className="text-xs text-cyan-600">Guardando...</span>}
      </div>

      <div className="space-y-6">
        {/* Superior */}
        <div>
          <p className="text-xs text-slate-400 mb-2 text-center">Arcada superior</p>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {DIENTES_SUPERIORES.map((n) => <Diente key={n} numero={n} />)}
          </div>
        </div>
        <div className="border-t border-dashed border-slate-200" />
        {/* Inferior */}
        <div>
          <div className="flex justify-center gap-1.5 flex-wrap">
            {DIENTES_INFERIORES.map((n) => <Diente key={n} numero={n} />)}
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">Arcada inferior</p>
        </div>
      </div>

      {/* Panel de edición */}
      {selected && (
        <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <p className="text-sm font-medium text-slate-700 mb-3">Diente {selected} — seleccionar estado:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(ESTADO_COLORES).map(([estado, color]) => (
              <button
                key={estado}
                onClick={() => actualizarDiente(selected, estado)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${(estadoMap[selected] ?? 'SANO') === estado ? 'border-cyan-500 bg-cyan-50 text-cyan-700' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
              >
                <span className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0" style={{ backgroundColor: color }} />
                {estado}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(ESTADO_COLORES).map(([estado, color]) => (
          <div key={estado} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-3 h-3 rounded border border-slate-200 flex-shrink-0" style={{ backgroundColor: color }} />
            {estado}
          </div>
        ))}
      </div>
    </div>
  )
}
