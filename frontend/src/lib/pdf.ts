import html2pdf from 'html2pdf.js'

// Genera un PDF (A4) desde un elemento del DOM y lo devuelve como base64 SIN el
// prefijo `data:` — listo para adjuntar a un correo. Reutiliza las mismas
// opciones que la descarga de documentos.
export async function elementoAPdfBase64(el: HTMLElement): Promise<string> {
  const opts = {
    margin: [10, 10, 12, 10],
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataUri: string = await html2pdf().set(opts as any).from(el).outputPdf('datauristring')
  return dataUri.replace(/^data:.*;base64,/, '')
}
