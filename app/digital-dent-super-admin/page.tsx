export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { prisma } from '@/lib/prisma'

async function loadStats() {
  try {
    const [clinicas, totalUsuarios, totalPacientes, totalCitas, citasMes, totalCobros, activas, enTrial, suspendidas] = await Promise.all([
      prisma.clinica.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          _count: { select: { users: true, pacientes: true } },
        },
      }),
      prisma.user.count({ where: { isPlatformAdmin: false } }),
      prisma.paciente.count(),
      prisma.cita.count(),
      prisma.cita.count({
        where: { fecha: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
      }),
      prisma.cobro.aggregate({ _sum: { monto: true } }),
      prisma.clinica.count({ where: { activo: true, plan: { not: 'TRIAL' } } }),
      prisma.clinica.count({ where: { activo: true, plan: 'TRIAL' } }),
      prisma.clinica.count({ where: { activo: false } }),
    ])
    return {
      ok: true as const,
      clinicas, totalUsuarios, totalPacientes, totalCitas, citasMes,
      volumen: totalCobros._sum.monto ?? 0,
      activas, enTrial, suspendidas,
    }
  } catch (e: any) {
    console.error('[super-admin/dashboard] Error cargando stats:', e)
    return { ok: false as const, error: e?.message ?? String(e) }
  }
}

export default async function SuperAdminDashboard() {
  const stats = await loadStats()

  if (!stats.ok) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="bg-red-950 border border-red-800 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-red-300 mb-2">Error al cargar el panel</h1>
          <p className="text-red-200 text-sm mb-4">El servidor devolvió un error al consultar la base de datos:</p>
          <pre className="bg-black/40 rounded-lg p-4 text-xs text-red-300 overflow-x-auto">{stats.error}</pre>
          <p className="text-red-300 text-xs mt-4">
            Probables causas: cliente Prisma desactualizado, columna nueva sin migrar, o credenciales de DB.
            Verifica los Runtime Logs de Vercel.
          </p>
        </div>
      </div>
    )
  }

  const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)

  const kpis = [
    { label: 'Clínicas activas',  value: stats.activas,      tono: 'emerald' },
    { label: 'En trial',          value: stats.enTrial,      tono: 'amber' },
    { label: 'Suspendidas',       value: stats.suspendidas,  tono: 'red' },
    { label: 'Usuarios totales',  value: stats.totalUsuarios, tono: 'sky' },
    { label: 'Pacientes totales', value: stats.totalPacientes, tono: 'fuchsia' },
    { label: 'Citas totales',     value: stats.totalCitas, tono: 'indigo' },
    { label: 'Citas este mes',    value: stats.citasMes, tono: 'purple' },
    { label: 'Volumen cobrado',   value: fmtCLP(stats.volumen), tono: 'teal', span: 2 },
  ]

  const tonoBg: Record<string, string> = {
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    amber:   'bg-amber-500/10 border-amber-500/30 text-amber-300',
    red:     'bg-red-500/10 border-red-500/30 text-red-300',
    sky:     'bg-sky-500/10 border-sky-500/30 text-sky-300',
    fuchsia: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300',
    indigo:  'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
    purple:  'bg-purple-500/10 border-purple-500/30 text-purple-300',
    teal:    'bg-teal-500/10 border-teal-500/30 text-teal-300',
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Panel de control</h1>
        <p className="text-slate-400 mt-1 text-sm">Vista general de todas las clínicas registradas en la plataforma.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-2xl border p-5 ${tonoBg[k.tono]} ${k.span === 2 ? 'col-span-2' : ''}`}>
            <p className="text-xs uppercase tracking-wider opacity-70">{k.label}</p>
            <p className="text-3xl font-bold mt-1 text-white">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold">Últimas clínicas registradas</h2>
          <Link href="/digital-dent-super-admin/clinicas" className="text-sm text-purple-300 hover:text-purple-200">
            Ver todas →
          </Link>
        </div>
        {stats.clinicas.length === 0 ? (
          <p className="px-6 py-10 text-center text-slate-500 text-sm">Sin clínicas registradas</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <th className="text-left px-6 py-3">Clínica</th>
                <th className="text-left px-6 py-3">Plan</th>
                <th className="text-left px-6 py-3">Estado</th>
                <th className="text-right px-6 py-3">Usuarios</th>
                <th className="text-right px-6 py-3">Pacientes</th>
                <th className="text-right px-6 py-3">Creada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {stats.clinicas.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/digital-dent-super-admin/clinicas/${c.id}`} className="text-white font-medium hover:text-purple-300">
                      {c.nombre}
                    </Link>
                    <p className="text-xs text-slate-500 font-mono">{c.slug}</p>
                  </td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300">{c.plan}</span>
                  </td>
                  <td className="px-6 py-3">
                    {c.activo
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300">Activa</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-300">Suspendida</span>}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-300">{c._count.users}</td>
                  <td className="px-6 py-3 text-right text-slate-300">{c._count.pacientes}</td>
                  <td className="px-6 py-3 text-right text-slate-400 text-xs">
                    {c.createdAt.toLocaleDateString('es-CL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
