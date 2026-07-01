// Meta Pixel (client-side) para las páginas públicas. El evento se dispara con
// un event_id que también viaja al backend (Conversions API) para deduplicar.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { fbq?: any; _fbq?: any } }

let inicializado = ''

export function initPixel(pixelId: string) {
  if (!pixelId || inicializado === pixelId) return
  inicializado = pixelId
  const w = window as any
  if (!w.fbq) {
    const n: any = (w.fbq = function (...args: any[]) { n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args) })
    if (!w._fbq) w._fbq = n
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = []
    const s = document.createElement('script')
    s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(s)
  }
  w.fbq('init', pixelId)
  w.fbq('track', 'PageView')
}

export function trackPixel(evento: string, data: Record<string, unknown> | undefined, eventId: string) {
  const w = window as any
  if (w.fbq) w.fbq('track', evento, data ?? {}, { eventID: eventId })
}

// Cookies _fbp / _fbc que setea el Pixel (identifican al navegador para Meta).
export function fbCookies(): { fbp?: string; fbc?: string } {
  const get = (name: string) => document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.split('=')[1]
  let fbc = get('_fbc')
  const fbclid = new URLSearchParams(window.location.search).get('fbclid')
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`
  return { fbp: get('_fbp'), fbc }
}

// Parámetros de campaña de la URL (UTM + fbclid) + referrer + landing.
export function trackingParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    utmSource: p.get('utm_source') ?? undefined,
    utmMedium: p.get('utm_medium') ?? undefined,
    utmCampaign: p.get('utm_campaign') ?? undefined,
    utmContent: p.get('utm_content') ?? undefined,
    utmTerm: p.get('utm_term') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
    referrer: document.referrer || undefined,
    landing: window.location.href,
  }
}

export function genEventId(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
