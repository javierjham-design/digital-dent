import { useState } from 'react'
import { getPais, validarDoc, formatDoc } from '@shared/constants/paises'
import { useAuth } from '@/hooks/useAuth'

// Campo de documento de identidad país-aware. Chile valida el RUT (dígito
// verificador) y lo formatea; los demás países validan por formato/largo. El
// checkbox "Otro documento" carga un identificador libre (pasaporte, etc.) sin
// validación. El padre maneja ambos valores (rut / otroDoc).
export function RutField({ rut, otroDoc, onChange }: {
  rut: string
  otroDoc: string
  onChange: (next: { rut: string; otroDoc: string }) => void
}) {
  const { user } = useAuth()
  const pais = user?.pais ?? 'CL'
  const cfg = getPais(pais).doc
  const [otro, setOtro] = useState(Boolean(otroDoc) && !rut)
  const valido = !rut || validarDoc(pais, rut)

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700 mb-1">
        {otro ? 'Otro documento' : cfg.label}
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
            onBlur={() => { if (rut && validarDoc(pais, rut)) onChange({ rut: formatDoc(pais, rut), otroDoc: '' }) }}
            placeholder={cfg.placeholder} inputMode="text"
            className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 ${rut && !valido ? 'border-rose-300 focus:ring-rose-400' : 'border-slate-200 focus:ring-cyan-500'}`} />
          {rut && !valido && <span className="block text-xs text-rose-600 mt-1">{cfg.label} inválido — revisa el formato (o marca «Otro documento»).</span>}
        </>
      )}
    </label>
  )
}
