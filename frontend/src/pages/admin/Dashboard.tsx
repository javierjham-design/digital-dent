import { useEffect, useState } from 'react'
import { adminService } from '@/services/admin.service'

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

interface Stats { activas: number; enTrial: number; suspendidas: number; total: number; demosActivas: number; mrr: number }

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { adminService.stats().then(setStats).catch(() => {}) }, [])

  const kpis = stats ? [
    { l: 'Clínicas activas', v: stats.activas, c: 'emerald' },
    { l: 'En trial', v: stats.enTrial, c: 'amber' },
    { l: 'Suspendidas', v: stats.suspendidas, c: 'rose' },
    { l: 'Demos activas', v: stats.demosActivas, c: 'cyan' },
    { l: 'Total clínicas', v: stats.total, c: 'sky' },
  ] : []
  const tone: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    amber: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    rose: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
    cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    sky: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Panel de control</h1>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        {kpis.map((k) => (
          <div key={k.l} className={`rounded-2xl border p-5 ${tone[k.c]}`}>
            <p className="text-xs uppercase tracking-wider opacity-70">{k.l}</p>
            <p className="text-3xl font-bold mt-1 text-white">{k.v}</p>
          </div>
        ))}
      </div>
      {stats && (
        <div className="bg-gradient-to-br from-teal-500/10 to-emerald-500/10 border border-teal-500/30 rounded-2xl p-6">
          <p className="text-xs uppercase tracking-wider text-teal-300/80">Ingresos mensuales recurrentes (MRR)</p>
          <p className="text-4xl font-bold mt-2 text-white">{fmtCLP(stats.mrr)}</p>
          <p className="text-xs text-teal-300/70 mt-2">Suma de planes activos no-trial + extras. Excluye demos.</p>
        </div>
      )}
    </div>
  )
}
