import { useEffect, useState } from 'react'
import { emailService, type EmailEnviado } from '@/services/email.service'

const TIPO_LABEL: Record<string, string> = {
  CONFIRMACION_HORA: 'Confirmación de hora', PRESUPUESTO: 'Presupuesto', CONSENTIMIENTO: 'Consentimiento',
  DOCUMENTO: 'Documento', COMPROBANTE: 'Comprobante', PLAN: 'Plan de tratamiento', DEUDA: 'Aviso de deuda', OTRO: 'Otro',
}
const fecha = (s: string) => new Date(s).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })

// Historial de correos enviados a un paciente (o de toda la clínica si no se pasa id).
export function HistorialCorreos({ pacienteId, refreshKey }: { pacienteId?: string; refreshKey?: number }) {
  const [items, setItems] = useState<EmailEnviado[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => { emailService.historial(pacienteId).then(setItems).catch(() => {}).finally(() => setCargando(false)) }, [pacienteId, refreshKey])

  if (cargando) return <p className="text-sm text-slate-400">Cargando…</p>
  if (items.length === 0) return <p className="text-sm text-slate-400">Aún no se han enviado correos.</p>
  return (
    <div className="divide-y divide-slate-100">
      {items.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm text-slate-800 truncate">{e.asunto}</p>
            <p className="text-xs text-slate-500 truncate">
              {TIPO_LABEL[e.tipo] ?? e.tipo} · {e.para} · {fecha(e.createdAt)}{e.enviadoPorNombre ? ` · ${e.enviadoPorNombre}` : ''}
            </p>
            {e.estado === 'ERROR' && e.error && <p className="text-[11px] text-rose-500 truncate">Error: {e.error}</p>}
          </div>
          <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${e.estado === 'ENVIADO' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            {e.estado === 'ENVIADO' ? 'Enviado' : 'Error'}
          </span>
        </div>
      ))}
    </div>
  )
}
