// Generación de eventos de calendario (iCalendar / .ics) y del enlace de "Agregar
// a Google Calendar". El .ics lo entienden Apple Calendar, Google Calendar y
// Outlook: se adjunta al correo de confirmación para que el paciente agregue la
// cita a su calendario con un toque.

// Fecha en UTC con formato iCalendar: YYYYMMDDTHHMMSSZ.
function fmtUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Escapa los caracteres especiales de un valor de texto iCalendar.
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export interface EventoCalendario {
  uid: string
  inicio: Date
  fin: Date
  titulo: string
  descripcion?: string | null
  ubicacion?: string | null
}

// Documento .ics (VCALENDAR con un VEVENT). Líneas separadas por CRLF (requisito
// del formato). METHOD:PUBLISH → el cliente ofrece "Agregar al calendario".
export function construirICS(e: EventoCalendario): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clariva//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${fmtUTC(new Date())}`,
    `DTSTART:${fmtUTC(e.inicio)}`,
    `DTEND:${fmtUTC(e.fin)}`,
    `SUMMARY:${esc(e.titulo)}`,
    ...(e.descripcion ? [`DESCRIPTION:${esc(e.descripcion)}`] : []),
    ...(e.ubicacion ? [`LOCATION:${esc(e.ubicacion)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.join('\r\n')
}

// Enlace "Agregar a Google Calendar" (abre el evento pre-llenado en el navegador).
export function googleCalendarUrl(e: EventoCalendario): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.titulo,
    dates: `${fmtUTC(e.inicio)}/${fmtUTC(e.fin)}`,
    ...(e.descripcion ? { details: e.descripcion } : {}),
    ...(e.ubicacion ? { location: e.ubicacion } : {}),
  })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}
