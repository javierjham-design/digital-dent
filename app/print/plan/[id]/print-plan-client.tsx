'use client'

import { useEffect } from 'react'

type Tratamiento = {
  prestacion: string
  pieza: string
  precio: number
  descuento: number
  subtotal: number
  estado: string
  pagado: boolean
}

type Seccion = {
  titulo: string
  tratamientos: Tratamiento[]
}

type Data = {
  clinica: { nombre: string; direccion: string; ciudad: string; telefono: string; email: string; logoUrl: string | null }
  plan: { id: string; numero: string; nombre: string; createdAt: string }
  doctor: { name: string; rut: string } | null
  paciente: { nombre: string; rut: string; fechaNacimiento: string | null; prevision: string; email: string }
  secciones: Seccion[]
  sinSeccion: Tratamiento[]
  totalPagado: number
}

const fmtCLP = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
const fmtDate = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'No definida'

function estadoLabel(e: string): string {
  if (e === 'COMPLETADO') return 'Realizada'
  if (e === 'EN_PROGRESO') return 'En progreso'
  return 'Planificada'
}

export function PrintPlanClient({ data }: { data: Data }) {
  const { clinica, plan, doctor, paciente, secciones, sinSeccion, totalPagado } = data

  useEffect(() => {
    // Trigger print dialog automáticamente al abrir
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  // Combinar todas las secciones (incluyendo "sin sección" como una más al final si tiene tratamientos)
  const seccionesRender: Seccion[] = [
    ...secciones,
    ...(sinSeccion.length > 0 ? [{ titulo: 'Otras acciones', tratamientos: sinSeccion }] : []),
  ]

  const subtotalGeneral = seccionesRender.reduce(
    (s, sec) => s + sec.tratamientos.reduce((ss, t) => ss + (t.precio * t.precio === 0 ? 0 : t.precio), 0),
    0,
  )
  const totalBruto = seccionesRender.reduce(
    (s, sec) => s + sec.tratamientos.reduce((ss, t) => ss + t.precio, 0),
    0,
  )
  const descuentoTotal = totalBruto - seccionesRender.reduce(
    (s, sec) => s + sec.tratamientos.reduce((ss, t) => ss + t.subtotal, 0),
    0,
  )
  const totalFinal = totalBruto - descuentoTotal
  const porPagar = Math.max(0, totalFinal - totalPagado)

  return (
    <div id="print-area" className="max-w-4xl mx-auto p-8 bg-white text-slate-900 font-sans">
      {/* Header */}
      <header className="flex items-start justify-between border-b border-slate-200 pb-4 mb-6">
        <div className="flex items-start gap-3">
          {clinica.logoUrl ? (
            <img src={clinica.logoUrl} alt={clinica.nombre} className="w-20 h-20 object-contain rounded" />
          ) : (
            <div className="w-20 h-20 bg-slate-100 rounded flex items-center justify-center text-slate-400 text-xs">
              Logo
            </div>
          )}
        </div>
        <div className="text-right text-xs leading-relaxed">
          <p className="text-xl font-bold text-slate-900 mb-1">{clinica.nombre}</p>
          {doctor && (
            <>
              <p className="text-slate-700"><strong>Dr.</strong> {doctor.name}{doctor.rut ? <>, <strong>RUT:</strong> {doctor.rut}</> : null}</p>
            </>
          )}
          <p><strong>PDT:</strong> nº {plan.numero} {plan.nombre}</p>
          <p><strong>Generado:</strong> {fmtDate(plan.createdAt)}, <strong>Impreso:</strong> {fmtDate(new Date().toISOString())}</p>
          <p><strong>ID:</strong> {plan.id.slice(-4).toUpperCase()}</p>
        </div>
      </header>

      <h1 className="text-2xl font-bold text-center mb-8">
        Presupuesto nº {plan.numero}:<br />
        <span className="font-bold">{plan.nombre}</span>
      </h1>

      {/* Datos paciente */}
      <section className="mb-6">
        <h2 className="text-lg font-bold mb-3">Paciente:</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div><strong>Nombre:</strong> {paciente.nombre}</div>
          <div><strong>Fecha de Nacimiento:</strong> {fmtDate(paciente.fechaNacimiento)}</div>
          <div><strong>RUT:</strong> {paciente.rut || '—'}</div>
          <div><strong>Convenio:</strong> {paciente.prevision || ''}</div>
        </div>
      </section>

      {/* Detalle */}
      <section className="mb-6">
        <h2 className="text-lg font-bold mb-3">Detalle del Presupuesto:</h2>
        {seccionesRender.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Sin acciones registradas en el plan.</p>
        ) : (
          seccionesRender.map((sec, i) => (
            <div key={i} className="mb-5">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left py-2 pr-2 font-bold w-24">Estado</th>
                    <th className="text-left py-2 pr-2 font-bold">{sec.titulo}</th>
                    <th className="text-right py-2 px-2 font-bold w-20">Pieza(s)</th>
                    <th className="text-right py-2 px-2 font-bold w-24">Subtotal</th>
                    <th className="text-right py-2 px-2 font-bold w-16">Dcto.</th>
                    <th className="text-right py-2 pl-2 font-bold w-24">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.tratamientos.map((t, ti) => (
                    <tr key={ti} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-700">{estadoLabel(t.estado)}</td>
                      <td className="py-1.5 pr-2">{t.prestacion}</td>
                      <td className="py-1.5 px-2 text-right">{t.pieza}</td>
                      <td className="py-1.5 px-2 text-right">{fmtCLP(t.precio)}</td>
                      <td className="py-1.5 px-2 text-right">{t.descuento || 0}%</td>
                      <td className="py-1.5 pl-2 text-right">{fmtCLP(t.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </section>

      {/* Resumen */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Resumen del Presupuesto:</h2>
        <div className="max-w-md text-sm">
          {seccionesRender.map((sec, i) => {
            const subtotal = sec.tratamientos.reduce((s, t) => s + t.subtotal, 0)
            return (
              <div key={i} className="flex justify-between py-1">
                <span>{sec.titulo}</span>
                <span>{fmtCLP(subtotal)}</span>
              </div>
            )
          })}
          <div className="flex justify-between border-t border-slate-300 mt-2 pt-2 font-bold">
            <span>Subtotal</span>
            <span>{fmtCLP(totalFinal + descuentoTotal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Descuento total</span>
            <span>(-) {fmtCLP(descuentoTotal)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-slate-900 mt-2 pt-2 font-bold text-base">
            <span>Total del presupuesto</span>
            <span>{fmtCLP(totalFinal)}</span>
          </div>
        </div>
      </section>

      {/* Estado de cuenta */}
      <section className="break-before-page mb-6">
        <h2 className="text-lg font-bold mb-3">Estado de cuenta:</h2>
        <div className="max-w-md ml-auto text-sm">
          <div className="flex justify-between py-1">
            <span>Total del presupuesto</span>
            <span>{fmtCLP(totalFinal)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Abonos del paciente</span>
            <span>(-) {fmtCLP(totalPagado)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-slate-900 mt-2 pt-2 font-bold text-base">
            <span>Total por pagar</span>
            <span>{fmtCLP(porPagar)}</span>
          </div>
        </div>
      </section>

      {/* Firmas */}
      <section className="mt-20 mb-8 grid grid-cols-2 gap-12 text-center text-sm">
        <div>
          <div className="border-t border-slate-400 pt-2">
            <p>{doctor?.name ?? 'Dr. ____________________'}</p>
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-2">
            <p>Firma Paciente y/o Apoderado</p>
          </div>
        </div>
      </section>

      <p className="text-xs text-slate-600 mb-6">
        Presupuesto válido por 60 días. Los valores de laboratorios e insumos presentes en este documento están sujetos a cambios por variaciones de precios externas a la clínica.
      </p>

      {/* Footer */}
      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-600 grid grid-cols-2 gap-6">
        <div>
          <p className="font-bold text-slate-900 mb-1">{clinica.nombre}</p>
          {clinica.direccion && <p>📍 {clinica.direccion}{clinica.ciudad ? `, ${clinica.ciudad}` : ''}</p>}
          {clinica.telefono && <p>📞 {clinica.telefono}</p>}
          {clinica.email && <p>✉ {clinica.email}</p>}
        </div>
        <div className="text-right">
          <p>Al recibir este presupuesto el paciente acepta los términos y condiciones de la clínica.</p>
          <p className="mt-2 text-slate-400">Documento generado por Cláriva</p>
        </div>
      </footer>

      {/* Botón flotante para imprimir, no aparece al imprimir */}
      <div className="fixed bottom-6 right-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="px-5 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl shadow-lg font-semibold flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir
        </button>
      </div>
    </div>
  )
}
