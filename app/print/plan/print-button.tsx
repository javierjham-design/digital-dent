'use client'

export function PrintPlanButton() {
  return (
    <div className="print:hidden bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-300">Vista previa de impresión</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => window.history.back()}
          className="px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
        >
          ← Volver
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-1.5 text-xs font-medium bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimir / Guardar PDF
        </button>
      </div>
    </div>
  )
}
