import html2pdf from 'html2pdf.js'

// Espera a que las imágenes del elemento (ej. logo de la clínica) terminen de
// cargar. Sin esto, html2canvas puede capturar antes de tiempo y salir en blanco.
async function esperarImagenes(el: HTMLElement): Promise<void> {
  const imgs = Array.from(el.querySelectorAll('img'))
  await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth > 0)
    ? Promise.resolve()
    : new Promise<void>((res) => { img.onload = () => res(); img.onerror = () => res(); setTimeout(res, 4000) })))
}

// Genera un PDF (tamaño CARTA / letter) desde un elemento del DOM y lo devuelve
// como base64 SIN el prefijo `data:` — listo para adjuntar a un correo.
// Valida que el resultado no esté vacío: así, si algo falla, el envío muestra un
// error en vez de mandar el correo SIN el adjunto.
export async function elementoAPdfBase64(el: HTMLElement): Promise<string> {
  await esperarImagenes(el)
  const opts = {
    margin: [10, 10, 12, 10],
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataUri: string = await html2pdf().set(opts as any).from(el).outputPdf('datauristring')
  const base64 = dataUri.replace(/^data:.*;base64,/, '')
  if (!base64 || base64.length < 800) {
    throw new Error('No se pudo generar el PDF (documento vacío). Intenta nuevamente.')
  }
  return base64
}
