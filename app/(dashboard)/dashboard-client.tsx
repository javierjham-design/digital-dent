'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { formatCLP, formatDateTime } from '@/lib/utils'

const ESTADO_COLORS: Record<string, string> = {
  PENDIENTE: '#f59e0b',
  CONFIRMADA: '#0891b2',
  ATENDIDA: '#10b981',
  CANCELADA: '#ef4444',
  NO_ASISTIO: '#6b7280',
}

const ESTADO_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  ATENDIDA: 'Atendida',
  CANCELADA: 'Cancelada',
  NO_ASISTIO: 'No asistió',
}

interface Props {
  stats: { totalPacientes: number; citasHoy: number; citasMes: number; ingresosMes: number }
  graficoCitas: { dia: string; citas: number }[]
  estadosCitas: { name: string; value: number }[]
  proximasCitas: { id: string; paciente: string; doctor: string | null; fecha: string; tipo: string; estado: string }[]
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-1">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  )
}

export function DashboardClient({ stats, graficoCitas, estadosCitas, proximasCitas }: Props) {
  const mes = new Date().toLocaleString('es-CL', { month: 'long', year: 'numeric' })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Resumen de {mes}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Pacientes activos"
          value={stats.totalPacientes.toString()}
          sub="Total registrados"
          color="bg-cyan-50"
          icon={
            <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />
        <StatCard
          label="Citas hoy"
          value={stats.citasHoy.toString()}
          sub="Agendadas para hoy"
          color="bg-violet-50"
          icon={
            <svg className="w-6 h-6 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Citas del mes"
          value={stats.citasMes.toString()}
          sub={`Durante ${mes}`}
          color="bg-amber-50"
          icon={
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Ingresos del mes"
          value={formatCLP(stats.ingresosMes)}
          sub="Cobros pagados"
          color="bg-emerald-50"
          icon={
            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Bar chart - citas por día */}
        <div className="xl:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Citas por día este mes</h3>
          {graficoCitas.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={graficoCitas} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ borderRadius: '10px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  formatter={(v) => [`${v} cita${Number(v) !== 1 ? 's' : ''}`, ''] as [string, string]}
                  labelFormatter={(l) => `Día ${l}`}
                />
                <Bar dataKey="citas" fill="#0891b2" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Sin citas este mes</div>
          )}
        </div>

        {/* Pie chart - estados */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="font-semibold text-slate-900 mb-4">Estado de citas</h3>
          {estadosCitas.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={estadosCitas} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {estadosCitas.map((entry, i) => (
                    <Cell key={i} fill={ESTADO_COLORS[entry.name] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Legend
                  formatter={(value) => ESTADO_LABELS[value] ?? value}
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Tooltip formatter={(v, name) => [v, ESTADO_LABELS[String(name)] ?? name]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
          )}
        </div>
      </div>

      {/* Próximas citas */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Próximas citas</h3>
          <a href="/agenda" className="text-sm text-cyan-600 hover:text-cyan-700 font-medium">Ver agenda →</a>
        </div>
        {proximasCitas.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No hay citas próximas agendadas</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {proximasCitas.map((cita) => (
              <div key={cita.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-cyan-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-cyan-700 text-sm font-semibold">{cita.paciente[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{cita.paciente}</p>
                    <p className="text-xs text-slate-400">{cita.doctor} · {cita.tipo}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-700 font-medium">{formatDateTime(cita.fecha)}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${
                    cita.estado === 'CONFIRMADA' ? 'bg-cyan-100 text-cyan-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {ESTADO_LABELS[cita.estado] ?? cita.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
