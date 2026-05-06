export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatRUT, formatDate, formatCLP, calcularEdad } from '@/lib/utils'
import { PrintPlanButton } from './print-button'

export default async function PrintPlanPage({ searchParams }: { searchParams: Promise<{ pacienteId?: string }> }) {
  const { pacienteId } = await searchParams
  if (!pacienteId) return <div className="p-8 text-red-600">pacienteId requerido</div>

  const paciente = await prisma.paciente.findUnique({
    where: { id: pacienteId },
    include: {
      fichaClinica: {
        include: {
          tratamientos: {
            include: { prestacion: true },
            orderBy: { fecha: 'asc' },
          },
        },
      },
    },
  })

  if (!paciente) return <div className="p-8 text-red-600">Paciente no encontrado</div>

  const tratamientos = paciente.fichaClinica?.tratamientos ?? []
  const total = tratamientos.reduce((s, t) => s + t.precio, 0)
  const totalPlanificado = tratamientos.filter((t) => t.estado !== 'COMPLETADO').reduce((s, t) => s + t.precio, 0)

  const porEstado = {
    PLANIFICADO: tratamientos.filter((t) => t.estado === 'PLANIFICADO'),
    EN_PROGRESO: tratamientos.filter((t) => t.estado === 'EN_PROGRESO'),
    COMPLETADO: tratamientos.filter((t) => t.estado === 'COMPLETADO'),
  }

  const ESTADO_LABELS: Record<string, string> = {
    PLANIFICADO: 'Planificado', EN_PROGRESO: 'En progreso', COMPLETADO: 'Completado',
  }

  function describePieza(diente: number | null, cara: string | null) {
    if (diente) return `Pieza ${diente}`
    if (cara) return cara
    return 'General'
  }

  return (
    <div className="min-h-screen bg-white">
      <PrintPlanButton />

      {/* Documento imprimible */}
      <div id="print-area" className="max-w-[800px] mx-auto px-8 py-10 text-sm font-[system-ui]">
        {/* Encabezado clínica */}
        <div className="flex items-start justify-between border-b-2 border-cyan-600 pb-5 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-cyan-700">Digital-Dent</h1>
            <p className="text-slate-500 text-xs mt-0.5">Clínica Dental · Temuco, Chile</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-800">Plan de Tratamiento</p>
            <p className="text-xs text-slate-500 mt-0.5">Fecha: {formatDate(new Date())}</p>
          </div>
        </div>

        {/* Datos del paciente */}
        <div className="bg-slate-50 rounded-xl p-5 mb-6 border border-slate-200">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos del Paciente</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Nombre:</span><span className="font-semibold">{paciente.nombre} {paciente.apellido}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">RUT:</span><span className="font-semibold font-mono">{formatRUT(paciente.rut)}</span></div>
            {paciente.fechaNacimiento && <div className="flex justify-between"><span className="text-slate-500">Edad:</span><span className="font-semibold">{calcularEdad(paciente.fechaNacimiento)} años</span></div>}
            {paciente.telefono && <div className="flex justify-between"><span className="text-slate-500">Teléfono:</span><span className="font-semibold">{paciente.telefono}</span></div>}
            {paciente.prevision && <div className="flex justify-between"><span className="text-slate-500">Previsión:</span><span className="font-semibold">{paciente.prevision}</span></div>}
            {paciente.email && <div className="flex justify-between"><span className="text-slate-500">Email:</span><span className="font-semibold">{paciente.email}</span></div>}
          </div>
        </div>

        {/* Tabla de tratamientos */}
        {tratamientos.length === 0 ? (
          <p className="text-center text-slate-400 py-8">Sin tratamientos en el plan</p>
        ) : (
          <div className="mb-6">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-cyan-600 text-white">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold rounded-tl-lg">N°</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">Pieza / Zona</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">Acción Clínica</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold">Estado</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold hidden-print:hidden">Observaciones</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold rounded-tr-lg">Precio</th>
                </tr>
              </thead>
              <tbody>
                {tratamientos.map((t, i) => (
                  <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold text-cyan-700">{describePieza(t.diente, t.cara)}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{t.prestacion.nombre}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.estado === 'COMPLETADO' ? 'bg-emerald-100 text-emerald-700' :
                        t.estado === 'EN_PROGRESO' ? 'bg-blue-100 text-blue-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{ESTADO_LABELS[t.estado]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{t.notas || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatCLP(t.precio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Resumen de totales */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2">
            {porEstado.COMPLETADO.length > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Tratamientos completados ({porEstado.COMPLETADO.length})</span>
                <span>{formatCLP(porEstado.COMPLETADO.reduce((s, t) => s + t.precio, 0))}</span>
              </div>
            )}
            {(porEstado.PLANIFICADO.length + porEstado.EN_PROGRESO.length) > 0 && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Pendientes / En progreso</span>
                <span>{formatCLP(totalPlanificado)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-slate-200 pt-2">
              <span>Total plan</span>
              <span className="text-cyan-700">{formatCLP(total)}</span>
            </div>
          </div>
        </div>

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-12 mt-10 pt-6 border-t border-slate-200">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-12"></div>
            <p className="text-xs text-slate-500">Firma del Profesional</p>
            <p className="text-xs text-slate-400 mt-0.5">Digital-Dent Temuco</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-12"></div>
            <p className="text-xs text-slate-500">Firma del Paciente</p>
            <p className="text-xs text-slate-400 mt-0.5">{paciente.nombre} {paciente.apellido}</p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-300 mt-8">
          Digital-Dent Temuco · Documento generado el {formatDate(new Date())}
        </p>
      </div>
    </div>
  )
}
