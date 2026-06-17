import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'

interface Lead { id: string; nombre: string; email: string; telefono: string | null; nombreClinica: string | null; rubro: string | null; origen: string; clinicaSlug: string | null; createdAt: string }
const RUBRO: Record<string, string> = { dental: 'Dental', medico: 'Médico', estetica: 'Estética' }

export function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [cargando, setCargando] = useState(true)
  useEffect(() => { adminService.leads().then((r) => setLeads(r.leads as Lead[])).finally(() => setCargando(false)) }, [])

  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">Leads / Demos</h1>
      <p className="text-slate-400 text-sm mb-6">{leads.length} prospecto{leads.length === 1 ? '' : 's'} captado{leads.length === 1 ? '' : 's'} desde la landing.</p>
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {cargando ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Cargando…</p>
          : leads.length === 0 ? <p className="px-6 py-10 text-center text-slate-500 text-sm">Aún no hay leads.</p>
          : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-6 py-3">Contacto</th><th className="text-left px-6 py-3">Negocio</th><th className="text-left px-6 py-3">Rubro</th><th className="text-right px-6 py-3">Fecha</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-800">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40">
                    <td className="px-6 py-3"><p className="text-white font-medium">{l.nombre}</p><a href={`mailto:${l.email}`} className="text-xs text-purple-300">{l.email}</a>{l.telefono && <p className="text-xs text-slate-500">{l.telefono}</p>}</td>
                    <td className="px-6 py-3 text-slate-300">{l.nombreClinica ?? '—'}</td>
                    <td className="px-6 py-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">{l.rubro ? RUBRO[l.rubro] ?? l.rubro : '—'}</span></td>
                    <td className="px-6 py-3 text-right text-slate-400 text-xs whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  )
}
