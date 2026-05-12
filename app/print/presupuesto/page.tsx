export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/prisma'
import { formatRUT, formatDate, formatCLP, calcularEdad } from '@/lib/utils'
import { PrintPlanButton } from '../plan/print-button'

export default async function PrintPresupuestoPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams
  if (!id) return <div className="p-8 text-red-600">ID de presupuesto requerido</div>

  const presupuesto = await prisma.presupuesto.findUnique({
    where: { id },
    include: {
      paciente: true,
      items: { include: { prestacion: true } },
    },
  })

  if (!presupuesto) return <div className="p-8 text-red-600">Presupuesto no encontrado</div>

  const subtotal = presupuesto.items.reduce((s, i) => s + i.subtotal, 0)

  return (
    <div className="min-h-screen bg-white">
      <PrintPlanButton />

      <div id="print-area" className="max-w-[800px] mx-auto px-8 py-10 text-sm">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-cyan-600 pb-5 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-cyan-700">Digital-Dent</h1>
            <p className="text-slate-500 text-xs mt-0.5">Clínica Dental · Temuco, Chile</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-slate-800">Presupuesto N° {presupuesto.numero}</p>
            <p className="text-xs text-slate-500 mt-0.5">Fecha: {formatDate(presupuesto.createdAt)}</p>
            {presupuesto.vigencia && (
              <p className="text-xs text-slate-500">Vigente hasta: {formatDate(presupuesto.vigencia)}</p>
            )}
            <span className={`mt-1 inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
              presupuesto.estado === 'APROBADO' ? 'bg-emerald-100 text-emerald-700' :
              presupuesto.estado === 'RECHAZADO' ? 'bg-red-100 text-red-700' :
              'bg-amber-100 text-amber-700'
            }`}>{presupuesto.estado}</span>
          </div>
        </div>

        {/* Datos paciente */}
        <div className="bg-slate-50 rounded-xl p-5 mb-6 border border-slate-200">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Datos del Paciente</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5">
            <div className="flex justify-between text-sm"><span className="text-slate-500">Nombre:</span><span className="font-semibold">{presupuesto.paciente.nombre} {presupuesto.paciente.apellido}</span></div>
            {presupuesto.paciente.rut && <div className="flex justify-between text-sm"><span className="text-slate-500">RUT:</span><span className="font-semibold font-mono">{formatRUT(presupuesto.paciente.rut)}</span></div>}
            {presupuesto.paciente.fechaNacimiento && <div className="flex justify-between text-sm"><span className="text-slate-500">Edad:</span><span className="font-semibold">{calcularEdad(presupuesto.paciente.fechaNacimiento)} años</span></div>}
            {presupuesto.paciente.telefono && <div className="flex justify-between text-sm"><span className="text-slate-500">Teléfono:</span><span className="font-semibold">{presupuesto.paciente.telefono}</span></div>}
            {presupuesto.paciente.prevision && <div className="flex justify-between text-sm"><span className="text-slate-500">Previsión:</span><span className="font-semibold">{presupuesto.paciente.prevision}</span></div>}
          </div>
        </div>

        {/* Items */}
        <table className="w-full border-collapse mb-6">
          <thead>
            <tr className="bg-cyan-600 text-white text-xs">
              <th className="text-left px-4 py-2.5 rounded-tl-lg">N°</th>
              <th className="text-left px-4 py-2.5">Prestación / Tratamiento</th>
              <th className="text-center px-4 py-2.5">Cant.</th>
              <th className="text-right px-4 py-2.5">Precio unit.</th>
              <th className="text-right px-4 py-2.5">Desc.</th>
              <th className="text-right px-4 py-2.5 rounded-tr-lg">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {presupuesto.items.map((item, i) => (
              <tr key={item.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-4 py-2.5 text-slate-400 text-xs">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{item.prestacion.nombre}</td>
                <td className="px-4 py-2.5 text-center text-slate-600">{item.cantidad}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{formatCLP(item.precioUnitario)}</td>
                <td className="px-4 py-2.5 text-right text-slate-500">{item.descuento > 0 ? `${item.descuento}%` : '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{formatCLP(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm text-slate-500">
              <span>Subtotal</span><span>{formatCLP(subtotal)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t-2 border-cyan-600 pt-2">
              <span>Total</span>
              <span className="text-cyan-700 text-lg">{formatCLP(presupuesto.total)}</span>
            </div>
          </div>
        </div>

        {/* Notas */}
        {presupuesto.notas && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-xs font-bold text-amber-700 mb-1">Observaciones</p>
            <p className="text-sm text-amber-800">{presupuesto.notas}</p>
          </div>
        )}

        {/* Condiciones */}
        <div className="bg-slate-50 rounded-xl p-4 mb-8 border border-slate-200">
          <p className="text-xs font-bold text-slate-600 mb-2">Condiciones del presupuesto</p>
          <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
            <li>Este presupuesto tiene una validez de 30 días desde su emisión.</li>
            <li>Los precios pueden variar según el diagnóstico definitivo.</li>
            <li>Se requiere 50% de anticipo para iniciar tratamiento.</li>
            <li>Los precios incluyen IVA según corresponda.</li>
          </ul>
        </div>

        {/* Firmas */}
        <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-200">
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-12"></div>
            <p className="text-xs text-slate-500">Firma del Profesional</p>
            <p className="text-xs text-slate-400 mt-0.5">Digital-Dent Temuco</p>
          </div>
          <div className="text-center">
            <div className="border-b border-slate-400 mb-2 h-12"></div>
            <p className="text-xs text-slate-500">Firma / Aceptación del Paciente</p>
            <p className="text-xs text-slate-400 mt-0.5">{presupuesto.paciente.nombre} {presupuesto.paciente.apellido}</p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-300 mt-8">
          Digital-Dent Temuco · Presupuesto N° {presupuesto.numero} · {formatDate(presupuesto.createdAt)}
        </p>
      </div>
    </div>
  )
}
