import { useState } from 'react'
import { emailService, type TipoEmail } from '@/services/email.service'
import { ApiError } from '@/services/api'

// Modal reutilizable para enviar un documento por correo al paciente. Si se pasa
// `generarPdf`, adjunta el PDF (lo genera el frontend en el momento de enviar).
export function EnviarCorreoModal({
  tipo, titulo, asuntoDefault, pacienteId, pacienteNombre, defaultEmail, mensajeDefault, generarPdf, montoPago, onClose, onSent,
}: {
  tipo: TipoEmail
  titulo: string
  asuntoDefault: string
  pacienteId?: string
  pacienteNombre?: string
  defaultEmail?: string | null
  mensajeDefault?: string
  generarPdf?: () => Promise<{ base64: string; nombre: string }>
  montoPago?: number   // si viene, incluye un botón de pago (Flow) por ese monto
  onClose: () => void
  onSent?: () => void
}) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [asunto, setAsunto] = useState(asuntoDefault)
  const [mensaje, setMensaje] = useState(mensajeDefault ?? '')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)

  async function enviar() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Ingresa un email válido.'); return }
    setEnviando(true); setError('')
    try {
      let pdf: { base64: string; nombre: string } | undefined
      if (generarPdf) pdf = await generarPdf()
      await emailService.enviar({
        to: email.trim(), tipo, asunto: asunto.trim(), mensaje: mensaje.trim() || undefined,
        pacienteId, pacienteNombre, pdfBase64: pdf?.base64, pdfNombre: pdf?.nombre,
        montoPago: montoPago && montoPago > 0 ? montoPago : undefined,
      })
      setOk(true); onSent?.()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'No se pudo enviar el correo')
    } finally { setEnviando(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900">Enviar {titulo} por correo</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {ok ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 text-2xl flex items-center justify-center mx-auto mb-3">✓</div>
            <p className="text-sm text-slate-700">Correo enviado a <span className="font-semibold">{email}</span>.</p>
            <p className="text-xs text-slate-400 mt-1">Si el paciente responde, el correo llegará a la casilla de la clínica.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-xl">Listo</button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block"><span className="text-xs font-medium text-slate-500">Para</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@paciente.cl" inputMode="email"
                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </label>
            <label className="block"><span className="text-xs font-medium text-slate-500">Asunto</span>
              <input value={asunto} onChange={(e) => setAsunto(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </label>
            <label className="block"><span className="text-xs font-medium text-slate-500">Mensaje (opcional)</span>
              <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} placeholder="Escribe un mensaje para el paciente…"
                className="mt-1 w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </label>
            {generarPdf && <p className="text-[11px] text-slate-400">Se adjuntará el documento en PDF.</p>}
            {montoPago && montoPago > 0 ? <p className="text-[11px] text-cyan-600">Se incluirá un botón de pago (Flow) para que el paciente pague en línea. Requiere tener Flow configurado.</p> : null}
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={enviar} disabled={enviando} className="flex-1 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold">{enviando ? 'Enviando…' : 'Enviar correo'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
