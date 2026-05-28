'use client'

import { formatCLP, formatDate, formatRUT } from '@/lib/utils'
import { PrintPlanButton } from '../../plan/print-button'

interface ClinicaInfo {
  nombre: string; direccion: string; ciudad: string; telefono: string; email: string
  rut: string | null; logoUrl: string | null
}

interface CobroItem { id: string; descripcion: string; monto: number }

interface CobroPrint {
  id: string; numero: number; concepto: string
  monto: number; montoNeto: number | null; comisionMonto: number | null
  estado: string
  anulado: boolean; motivoAnulacion: string | null; anuladoAt: string | null; anuladoPorNombre: string | null
  fechaPago: string | null; createdAt: string; notas: string | null
  paciente: { nombre: string; apellido: string; rut: string | null; telefono: string | null; email: string | null; direccion: string | null }
  medioPago: { nombre: string } | null
  reciboUsuario: { nombre: string | null } | null
  items: CobroItem[]
}

export function PrintCobroClient({ clinica, cobro }: { clinica: ClinicaInfo | null; cobro: CobroPrint }) {
  const fecha = cobro.fechaPago ?? cobro.createdAt
  return (
    <div className="min-h-screen bg-white">
      <PrintPlanButton />

      <div id="print-area" className="max-w-[800px] mx-auto px-8 py-10 text-sm relative">
        {cobro.anulado && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            aria-hidden
          >
            <span className="text-[140px] font-black text-rose-200/70 rotate-[-20deg] select-none tracking-wider">
              ANULADO
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-cyan-600 pb-5 mb-6 relative">
          <div className="flex items-start gap-3">
            {clinica?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinica.logoUrl} alt="Logo" className="w-14 h-14 object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-cyan-700">{clinica?.nombre ?? 'Clínica'}</h1>
              <p className="text-slate-500 text-xs mt-0.5">
                {clinica?.direccion}{clinica?.ciudad ? `, ${clinica.ciudad}` : ''}
              </p>
              <p className="text-slate-500 text-xs">
                {clinica?.telefono}{clinica?.email ? ` · ${clinica.email}` : ''}
              </p>
              {clinica?.rut && <p className="text-slate-500 text-xs">RUT: {formatRUT(clinica.rut)}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Comprobante de pago</p>
            <p className="text-3xl font-bold text-slate-900 mt-1 font-mono">#{cobro.numero}</p>
            <p className="text-xs text-slate-500 mt-0.5">{formatDate(fecha)}</p>
          </div>
        </div>

        {/* Paciente */}
        <div className="grid grid-cols-2 gap-6 mb-6 relative">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Paciente</p>
            <p className="text-base font-semibold text-slate-900">{cobro.paciente.nombre} {cobro.paciente.apellido}</p>
            {cobro.paciente.rut && <p className="text-xs text-slate-500 font-mono">RUT {formatRUT(cobro.paciente.rut)}</p>}
            {cobro.paciente.direccion && <p className="text-xs text-slate-500">{cobro.paciente.direccion}</p>}
            {cobro.paciente.telefono && <p className="text-xs text-slate-500">Tel: {cobro.paciente.telefono}</p>}
            {cobro.paciente.email && <p className="text-xs text-slate-500">{cobro.paciente.email}</p>}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Datos del pago</p>
            <div className="space-y-0.5 text-xs">
              <p><span className="text-slate-500">Fecha de pago:</span> <span className="font-semibold text-slate-900">{formatDate(fecha)}</span></p>
              <p><span className="text-slate-500">Medio:</span> <span className="font-semibold text-slate-900">{cobro.medioPago?.nombre ?? 'Sin especificar'}</span></p>
              {cobro.reciboUsuario?.nombre && (
                <p><span className="text-slate-500">Recibido por:</span> <span className="font-semibold text-slate-900">{cobro.reciboUsuario.nombre}</span></p>
              )}
              <p><span className="text-slate-500">Estado:</span> <span className="font-semibold text-slate-900">{cobro.estado}</span></p>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mb-6 relative bg-white">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Detalle</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 w-32">Monto</th>
              </tr>
            </thead>
            <tbody>
              {cobro.items.map(i => (
                <tr key={i.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-sm text-slate-700">{i.descripcion}</td>
                  <td className="px-4 py-2.5 text-sm text-right font-semibold text-slate-900 font-mono">{formatCLP(i.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        <div className="flex justify-end relative">
          <div className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Bruto</span>
              <span className="font-semibold text-slate-900 font-mono">{formatCLP(cobro.monto)}</span>
            </div>
            {cobro.comisionMonto != null && cobro.comisionMonto > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Comisión</span>
                <span className="text-rose-600 font-mono">- {formatCLP(cobro.comisionMonto)}</span>
              </div>
            )}
            {cobro.montoNeto != null && cobro.montoNeto !== cobro.monto && (
              <div className="flex justify-between text-sm border-t border-slate-200 pt-1.5">
                <span className="text-slate-700">Neto recibido</span>
                <span className="font-bold text-teal-700 font-mono">{formatCLP(cobro.montoNeto)}</span>
              </div>
            )}
            <div className="flex justify-between text-base bg-slate-900 text-white rounded-lg px-3 py-2 mt-2">
              <span className="font-semibold">Total pagado</span>
              <span className="font-bold font-mono">{formatCLP(cobro.monto)}</span>
            </div>
          </div>
        </div>

        {cobro.notas && (
          <div className="mt-6 border-t border-slate-200 pt-4 relative">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Notas</p>
            <p className="text-sm text-slate-600">{cobro.notas}</p>
          </div>
        )}

        {cobro.anulado && (
          <div className="mt-6 border-2 border-rose-300 bg-rose-50 rounded-xl p-4 relative">
            <p className="text-sm font-bold text-rose-700 uppercase tracking-wide mb-1">Cobro anulado</p>
            <p className="text-sm text-rose-700"><span className="font-semibold">Motivo:</span> {cobro.motivoAnulacion ?? '—'}</p>
            <p className="text-xs text-rose-600 mt-0.5">
              Anulado por {cobro.anuladoPorNombre ?? '—'}{cobro.anuladoAt ? ` el ${formatDate(cobro.anuladoAt)}` : ''}
            </p>
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-12 relative">
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2 text-xs text-slate-500">Firma de quien recibe</div>
          </div>
          <div className="text-center">
            <div className="border-t border-slate-400 pt-2 text-xs text-slate-500">Firma del paciente</div>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-8 relative">
          Documento generado por {clinica?.nombre ?? 'la clínica'} · {formatDate(new Date().toISOString())}
        </p>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white; }
        }
      `}</style>
    </div>
  )
}
