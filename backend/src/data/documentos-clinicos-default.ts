// Plantillas base de documentos clínicos (recetas, certificados, indicaciones).
// Comparten el mismo motor de variables {{...}} que los consentimientos:
// - Auto: PACIENTE_NOMBRE_COMPLETO, PACIENTE_RUT, PACIENTE_EDAD, PACIENTE_FECHA_NACIMIENTO,
//   FECHA_HORA, PROFESIONAL_NOMBRE, PROFESIONAL_RUT_REGISTRO, FICHA_CLINICA_N.
// - Manuales (se llenan al generar): las demás (MEDICAMENTOS, INDICACIONES, etc.).
// Quedan EDITABLES por la clínica y se pueden agregar más desde Configuración.

const cabecera = `
<p><strong>Paciente:</strong> {{PACIENTE_NOMBRE_COMPLETO}}</p>
<p><strong>RUT/Documento:</strong> {{PACIENTE_RUT}} · <strong>Edad:</strong> {{PACIENTE_EDAD}}</p>
<p><strong>Fecha:</strong> {{FECHA_HORA}}</p>`

const firmaProfesional = `
<br><br>
<p>_______________________________</p>
<p><strong>{{PROFESIONAL_NOMBRE}}</strong></p>
<p>RUT / Registro: {{PROFESIONAL_RUT_REGISTRO}}</p>`

export interface DocumentoDefault { categoria: string; codigo: string; titulo: string; orden: number; camposRequeridos: string[]; html: string }

export const DOCUMENTOS_DEFAULT: DocumentoDefault[] = [
  {
    categoria: 'RECETA', codigo: 'RX-01', titulo: 'Receta médica', orden: 1,
    camposRequeridos: ['nombre', 'rut'],
    html:
      `<h1>RECETA MÉDICA</h1>${cabecera}` +
      `<h3>Rp.</h3>` +
      // MEDICAMENTOS es un campo de LISTA (se carga uno por uno con "+" y se imprime
      // como <ul>). No se envuelve en <p> para no anidar la lista dentro de un párrafo.
      `{{MEDICAMENTOS}}` +
      `<h3>Indicaciones</h3>` +
      `<p>{{INDICACIONES}}</p>` +
      firmaProfesional,
  },
  {
    categoria: 'ORDEN', codigo: 'ORD-01', titulo: 'Orden de exámenes', orden: 5,
    camposRequeridos: ['nombre', 'rut'],
    html:
      `<h1>ORDEN DE EXÁMENES</h1>${cabecera}` +
      `<h3>Exámenes solicitados</h3>` +
      // EXAMENES es un campo de LISTA (uno por uno con "+" → <ul>).
      `{{EXAMENES}}` +
      `<h3>Indicaciones</h3>` +
      `<p>{{INDICACIONES}}</p>` +
      firmaProfesional,
  },
  {
    categoria: 'CERTIFICADO', codigo: 'CERT-01', titulo: 'Certificado de atención odontológica', orden: 2,
    camposRequeridos: ['nombre', 'rut'],
    html:
      `<h1>CERTIFICADO DE ATENCIÓN</h1>${cabecera}` +
      `<p>Certifico que el/la paciente individualizado(a) asistió a atención odontológica en esta fecha` +
      ` por el siguiente motivo: {{MOTIVO}}.</p>` +
      `<p>Se indica reposo por {{DIAS_REPOSO}} día(s), desde {{FECHA_DESDE}} hasta {{FECHA_HASTA}} (si corresponde).</p>` +
      `<p>Observaciones: {{OBSERVACIONES}}</p>` +
      `<p>Se extiende el presente certificado a solicitud del interesado para los fines que estime convenientes.</p>` +
      firmaProfesional,
  },
  {
    categoria: 'INDICACION', codigo: 'IND-EXO', titulo: 'Indicaciones post-exodoncia', orden: 3,
    camposRequeridos: ['nombre'],
    html:
      `<h1>INDICACIONES POST-EXODONCIA</h1>${cabecera}` +
      `<p>Tras la extracción dental, siga estas indicaciones para una buena recuperación:</p>` +
      `<ul>` +
      `<li>Muerda la gasa con firmeza durante 30–45 minutos. Cámbiela sólo si se satura.</li>` +
      `<li>No escupa, no use bombilla ni se enjuague con fuerza durante las primeras 24 horas (evita sacar el coágulo).</li>` +
      `<li>Aplique frío local (hielo envuelto) por fuera de la mejilla, 15 minutos sí y 15 no, las primeras horas.</li>` +
      `<li>Dieta blanda y fría el primer día. Evite alimentos calientes, duros o picantes.</li>` +
      `<li>No fume ni consuma alcohol durante al menos 48–72 horas.</li>` +
      `<li>Higiene suave; desde el día siguiente enjuagues suaves con agua tibia con sal.</li>` +
      `<li>Tome los medicamentos indicados. Ante dolor intenso, sangrado que no cede, fiebre o hinchazón progresiva, contáctenos.</li>` +
      `</ul>` +
      `<p>Indicaciones adicionales: {{INDICACIONES}}</p>` +
      firmaProfesional,
  },
  {
    categoria: 'INDICACION', codigo: 'IND-PREOP', titulo: 'Recomendaciones preoperatorias', orden: 4,
    camposRequeridos: ['nombre'],
    html:
      `<h1>RECOMENDACIONES PREOPERATORIAS</h1>${cabecera}` +
      `<p>Antes de su procedimiento, considere lo siguiente:</p>` +
      `<ul>` +
      `<li>Informe cualquier enfermedad, alergia o medicamento que esté tomando (especialmente anticoagulantes).</li>` +
      `<li>Coma de forma liviana antes de la cita, salvo indicación distinta.</li>` +
      `<li>Tome los medicamentos previos sólo si fueron indicados por su profesional.</li>` +
      `<li>Duerma bien la noche anterior y acuda acompañado si se le indicó sedación.</li>` +
      `<li>Realice una buena higiene bucal antes de asistir.</li>` +
      `</ul>` +
      `<p>Indicaciones específicas: {{INDICACIONES}}</p>` +
      firmaProfesional,
  },
]
