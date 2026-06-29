import { useState } from 'react'
import { formatRut, validarRut } from '@shared/utils/rut'

// Campo de RUT chileno con validación del dígito verificador. Permite tildar
// "Otro documento" para cargar un identificador libre (pasaporte, etc.) sin la
// validación de RUT. El padre maneja ambos valores (rut / otroDoc).
export function RutField({ rut, otroDoc, onChange }: {
  rut: string
  otroDoc: string
  onChange: (next: { rut: string; otroDoc: string }) => void
}) {
  const [otro, setOtro] = useState(Boolean(otroDoc) && !rut)
  const valido = !rut || validarRut(rut)

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700 mb-1">
        {otro ? 'Otro documento' : 'RUT'}
        <span className="flex items-center gap-1.5 text-xs font-normal text-slate-500">
          <input type="checkbox" checked={otro}
            onChange={(e) => { const v = e.target.checked; setOtro(v); onChange(v ? { rut: '', otroDoc } : { rut, otroDoc: '' }) }} />
          Otro documento
        </span>
      </span>
      {otro ? (
        <input value={otroDoc} onChange={(e) => onChange({ rut: '', otroDoc: e.target.value })}
          placeholder="N° de pasaporte u otro documento"
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      ) : (
        <>
          <input value={rut}
            onChange={(e) => onChange({ rut: e.target.value, otroDoc: '' })}
            onBlur={() => { if (rut && validarRut(rut)) onChange({ rut: formatRut(rut), otroDoc: '' }) }}
            placeholder="12.345.678-9" inputMode="text"
            className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${rut && !valido ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200 focus:ring-cyan-500'}`} />
          {rut && !valido && <span className="block text-xs text-rose-600 mt-1">RUT inválido — revisa el dígito verificador (o marca «Otro documento»).</span>}
        </>
      )}
    </label>
  )
}
