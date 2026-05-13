export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { formatCLP, formatDate, formatRUT } from '@/lib/utils'
import { PrintPlanButton } from '../plan/print-button'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default async function PrintLiquidacionPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const u = await getSessionUser()
  if (!u?.clinicaId) redirect('/login')

  const { id } = await searchParams
  if (!id) return <div className="p-8 text-red-600">ID de liquidación requerido</div>

  const [liquidacion, clinica] = await Promise.all([
    prisma.liquidacion.findFirst({
      where: { id, clinicaId: u.clinicaId },
      include: {
        doctor: { select: { id: true, name: true, email: true, rut: true, especialidad: true, telefono: true } },
        contrato: true,
        items: { orderBy: { fechaCompletado: 'asc' } },
      },
    }),
    prisma.clinica.findUnique({ where: { id: u.clinicaId } }),
  ])

  if (!liquidacion) return <div className="p-8 text-red-600">Liquidación no encontrada</div>

  const [year, month] = liquidacion.periodo.split('-').map(Number)
  const periodoLabel = `${MESES[month - 1]} ${year}`

  const ESTADO_STYLES: Record<string, string> = {
    BORRADOR: 'bg-amber-100 text-amber-700',
    APROBADA: 'bg-blue-100 text-blue-700',
    PAGADA: 'bg-emerald-100 text-emerald-700',
  }

  return (
    <div className="min-h-screen bg-white">
      <PrintPlanButton />

      <div id="print-area" className="max-w-[800px] mx-auto px-8 py-10 text-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-cyan-600 pb-5 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-cyan-700">{clinica?.nombre ?? 'Clínica'}</h1>
            <p className="text-slate-500 text-xs mt-0.5">
              {[clinica?.direccion, clinica?.ciudad].filter(Boolean).join(' · ') || 'Clínica Dental'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-800">Liquidación de Honorarios</p>
            <p className="text-xs text-slate-500 mt-0.5">Período: {periodoLabel}</p>
            <p className="text-xs text-slate-500">Emitida: {formatDate(new Date())}</p>
            <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_STYLES[liquidacion.estado] ?? 'bg-slate-100 text-slate-600'}`}>
              {liquidacion.estado}
            </span>
          </div>
        </div>

        {/* Info doctor + contrato */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos del Profesional</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Nombre:</span><span className="font-semibold">{liquidacion.doctor.name}</span></div>
              {liquidacion.doctor.rut && <div className="flex justify-between"><span className="text-slate-500">RUT:</span><span className="font-semibold font-mono">{formatRUT(liquidacion.doctor.rut)}</span></div>}
              {liquidacion.doctor.especialidad && <div className="flex justify-between"><span className="text-slate-500">Especialidad:</span><span className="font-semibold">{liquidacion.doctor.especialidad}</span></div>}
              <div className="flex justify-between"><span className="text-slate-500">Email:</span><span className="font-semibold">{liquidacion.doctor.email}</span></div>
              {liquidacion.doctor.telefono && <div className="flex justify-between"><span className="text-slate-500">Teléfono:</span><span className="font-semibold">{liquidacion.doctor.telefono}</span></div>}
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Modalidad del Contrato</h2>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Tipo:</span><span className="font-semibold">{liquidacion.contrato.tipo === 'PORCENTAJE' ? 'Porcentaje' : 'Monto fijo'}</span></div>
              {liquidacion.contrato.tipo === 'PORCENTAJE'
                ? <div className="flex justify-between"><span className="text-slate-500">Porcentaje:</span><span className="font-semibold text-cyan-700">{liquidacion.contrato.porcentaje}% por tratamiento</span></div>
                : <div className="flex justify-between"><span className="text-slate-500">Monto fijo:</span><span className="font-semibold text-cyan-700">{formatCLP(liquidacion.contrato.montoFijo ?? 0)} por tratamiento</span></div>
              }
              <div className="flex justify-between"><span className="text-slate-500">Período:</span><span className="font-semibold">{periodoLabel}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">N° tratamientos:</span><span className="font-semibold">{liquidacion.items.length}</span></div>
            </div>
          </div>
        </div>

        {/* Tabla items */}
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-cyan-600 text-white text-xs">
              <th className="text-left px-3 py-2.5 rounded-tl-lg">N°</th>
              <th className="text-left px-3 py-2.5">Fecha</th>
              <th className="text-left px-3 py-2.5">Paciente</th>
              <th className="text-left px-3 py-2.5">Pieza/Zona</th>
              <th className="text-left px-3 py-2.5">Prestación</th>
              <th className="text-right px-3 py-2.5">Precio clínica</th>
              <th className="text-right px-3 py-2.5 rounded-tr-lg">Honorario</th>
            </tr>
          </thead>
          <tbody>
            {liquidacion.items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-3 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                <td className="px-3 py-2.5 text-slate-600 text-xs">{formatDate(item.fechaCompletado)}</td>
                <td className="px-3 py-2.5 font-medium text-slate-800">{item.pacienteNombre}</td>
                <td className="px-3 py-2.5 text-cyan-700 font-medium text-xs">{item.diente ?? 'General'}</td>
                <td className="px-3 py-2.5 text-slate-700">{item.prestacionNombre}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{formatCLP(item.precioTratamiento)}</td>
                <td className="px-3 py-2.5 text-right font-bold text-slate-900">{formatCLP(item.montoLiquidado)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="flex justify-end mb-8">
          <div className="w-80 space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Total bruto clínica</span>
              <span>{formatCLP(liquidacion.totalBruto)}</span>
            </div>
            {liquidacion.contrato.tipo === 'PORCENTAJE' && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Porcentaje aplicado</span>
                <span>{liquidacion.contrato.porcentaje}%</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t-2 border-cyan-600 pt-2">
              <span>Total honorarios</span>
              <span className="text-cyan-700 text-lg">{formatCLP(liquidacion.totalLiquidado)}</span>
            </div>
            {liquidacion.fechaPago && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Fecha de pago</span>
                <span className="font-semibold">{formatDate(new Date(liquidacion.fechaPago))}</span>
              </div>
            )}
          </div>
        </div>

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-200">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-12"></div>
            <p className="text-xs text-slate-500">Firma Empleador</p>
            <p className="text-xs text-slate-400 mt-0.5">Digital-Dent Temuco</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-12"></div>
            <p className="text-xs text-slate-500">Firma Profesional</p>
            <p className="text-xs text-slate-400 mt-0.5">{liquidacion.doctor.name}</p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-300 mt-8">
          Digital-Dent Temuco · Liquidación {periodoLabel} · {liquidacion.doctor.name}
        </p>
      </div>
    </div>
  )
}
