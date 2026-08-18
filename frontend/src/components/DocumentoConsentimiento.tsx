import { forwardRef } from 'react'
import html2pdf from 'html2pdf.js'

// Estilos del documento (se incrustan en el propio nodo para que html2pdf los
// capture al generar el PDF).
const DOC_CSS = `
.cl-doc { font-family: Georgia, 'Times New Roman', serif; color:#111; font-size:12px; line-height:1.5; background:#fff; }
.cl-doc .cl-header { display:flex; align-items:center; gap:12px; border-bottom:2px solid #0891b2; padding-bottom:8px; margin-bottom:14px; }
.cl-doc .cl-header img { height:52px; width:auto; max-width:180px; object-fit:contain; }
.cl-doc .cl-header .cl-nombre { font-size:17px; font-weight:bold; color:#0e7490; }
.cl-doc .cl-header .cl-sub { font-size:10px; color:#555; }
.cl-doc h1 { font-size:15px; text-align:center; margin:6px 0 12px; }
.cl-doc h3 { font-size:12.5px; margin:12px 0 4px; padding-bottom:2px; border-bottom:1px solid #e2e8f0; }
.cl-doc p { margin:5px 0; text-align:justify; }
.cl-doc ul { margin:5px 0 5px 18px; padding:0; list-style: disc outside; } .cl-doc li { margin:2px 0; list-style: disc outside; }
.cl-doc .chk { margin:3px 0; }
.cl-dato { font-style: italic; }
.cl-blank { display:inline-block; min-width:130px; border-bottom:1px solid #333; height:1em; }
.cl-firma-box { display:inline-block; min-width:210px; height:66px; border-bottom:1px solid #333; vertical-align:bottom; }
.cl-firma-box.firmada { border-bottom:none; }
.cl-firma-linea { display:inline-block; min-width:210px; height:52px; border-bottom:1px solid #333; vertical-align:bottom; }
.cl-firma-img { max-height:60px; max-width:230px; }
.cl-fechafirma { display:inline-block; min-width:130px; border-bottom:1px dotted #999; }
.cl-doc .cl-footer { margin-top:18px; border-top:1px solid #e2e8f0; padding-top:6px; font-size:9px; color:#666; text-align:center; }
`

interface Props { html: string; clinica?: { nombre?: string; logoUrl?: string | null; direccion?: string; ciudad?: string } }

// Documento del consentimiento (encabezado con logo/clínica + cuerpo renderizado).
// Sirve para la vista previa y como fuente del PDF.
export const DocumentoConsentimiento = forwardRef<HTMLDivElement, Props>(function DocumentoConsentimiento({ html, clinica }, ref) {
  return (
    <div ref={ref} className="cl-doc" style={{ padding: 24 }}>
      <style>{DOC_CSS}</style>
      <div className="cl-header">
        {clinica?.logoUrl ? <img src={clinica.logoUrl} alt="" /> : null}
        <div>
          <div className="cl-nombre">{clinica?.nombre ?? 'Clínica'}</div>
          <div className="cl-sub">{[clinica?.direccion, clinica?.ciudad].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="cl-body" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="cl-footer">Documento generado por {clinica?.nombre ?? 'la clínica'} · Consentimiento informado</div>
    </div>
  )
})

// Genera y descarga el PDF a partir del nodo del documento.
export async function descargarConsentimientoPDF(el: HTMLElement, filename: string) {
  const opts = {
    margin: [10, 10, 12, 10],
    filename,
    image: { type: 'jpeg', quality: 0.96 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }
   
  await html2pdf().set(opts as any).from(el).save()
}
