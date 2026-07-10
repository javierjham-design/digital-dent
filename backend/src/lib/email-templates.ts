// Plantillas HTML de correo. Diseño sobrio, inline-CSS (los clientes de correo no
// soportan hojas de estilo externas). El encabezado lleva el nombre de la clínica.

export interface ClinicaEmail { nombre: string; direccion?: string | null; telefono?: string | null; email?: string | null; logoUrl?: string | null }

// Envoltorio común: encabezado con la clínica + contenido + pie "vía Cláriva".
export function plantillaBase(clinica: ClinicaEmail, contenidoHtml: string): string {
  // Solo incrustamos el logo si es una URL http(s). Un logo como data URI (base64)
  // puede pesar cientos de KB y hace que Gmail "recorte" el correo (y muchos
  // clientes bloquean imágenes data:). En ese caso, mejor sin logo.
  const logoOk = clinica.logoUrl && /^https?:\/\//i.test(clinica.logoUrl)
  const logo = logoOk
    ? `<img src="${escapeAttr(clinica.logoUrl!)}" alt="" height="40" style="height:40px;border-radius:8px;margin-bottom:8px" />`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
    <div style="background:#0e7490;color:#fff;padding:20px 24px">
      ${logo}
      <div style="font-size:18px;font-weight:700">${escapeHtml(clinica.nombre)}</div>
      ${clinica.direccion ? `<div style="font-size:12px;opacity:.85">${escapeHtml(clinica.direccion)}</div>` : ''}
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.6">${contenidoHtml}</div>
    <div style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
      ${clinica.telefono ? `Tel: ${escapeHtml(clinica.telefono)} · ` : ''}${clinica.email ? `${escapeHtml(clinica.email)}` : ''}
      <br/>Enviado por ${escapeHtml(clinica.nombre)} · vía Cláriva. Puedes responder a este correo.
    </div>
  </div>
</body></html>`
}

export function confirmacionHoraHtml(clinica: ClinicaEmail, d: { paciente: string; fechaTexto: string; profesional?: string | null; tipo?: string | null; nota?: string | null }): string {
  const contenido = `
    <p>Hola ${escapeHtml(d.paciente)},</p>
    <p>Tu hora en <strong>${escapeHtml(clinica.nombre)}</strong> quedó agendada:</p>
    <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:12px;padding:14px 16px;margin:12px 0">
      <div style="font-size:16px;font-weight:700;text-transform:capitalize">${escapeHtml(d.fechaTexto)}</div>
      ${d.profesional ? `<div style="color:#334155">con ${escapeHtml(d.profesional)}</div>` : ''}
      ${d.tipo ? `<div style="color:#64748b;font-size:13px">${escapeHtml(d.tipo)}</div>` : ''}
    </div>
    ${d.nota ? `<p style="color:#334155">${escapeHtml(d.nota)}</p>` : ''}
    <p style="color:#64748b;font-size:13px">Si necesitas reprogramar o cancelar, responde este correo o llámanos.</p>`
  return plantillaBase(clinica, contenido)
}

// Cuerpo genérico para envíos con adjunto (presupuesto, consentimiento, comprobante…).
export function mensajeConAdjuntoHtml(clinica: ClinicaEmail, d: { paciente?: string | null; titulo: string; mensaje?: string | null }): string {
  const contenido = `
    <p>Hola${d.paciente ? ` ${escapeHtml(d.paciente)}` : ''},</p>
    <p>${d.mensaje ? escapeHtml(d.mensaje) : `Adjuntamos ${escapeHtml(d.titulo.toLowerCase())} de tu atención en ${escapeHtml(clinica.nombre)}.`}</p>
    <p style="color:#64748b;font-size:13px">El documento va adjunto en PDF. Ante cualquier duda, responde este correo.</p>`
  return plantillaBase(clinica, contenido)
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
function escapeAttr(s: string): string { return escapeHtml(s).replace(/`/g, '') }
