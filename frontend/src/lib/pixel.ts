// Meta Pixel (client-side) + captura de atribución para las páginas públicas.
// El evento se dispara con un event_id que también viaja al backend (Conversions
// API) para deduplicar. Además persistimos los parámetros de campaña (UTM +
// click-ids de todas las plataformas) en localStorage, para no perder la
// atribución si el usuario navega antes de enviar el formulario / reservar.

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

// Click-ids por plataforma: nombre en la URL → campo del backend.
const CLICK_IDS: Record<string, string> = {
  fbclid: 'fbclid',
  ctwa_clid: 'ctwaClid',
  gclid: 'gclid',
  msclkid: 'msclkid',
  ttclid: 'ttclid',
  twclid: 'twclid',
  li_fat_id: 'liFatId',
  igclid: 'igclid',
  dclid: 'dclid',
}
const UTMS: Record<string, string> = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
}
const LS_KEY = 'clariva_track'

type Store = Record<string, string | undefined>
const load = (): Store => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} } }
const save = (s: Store) => { try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* modo incógnito */ } }

// Captura y persiste la atribución en cada carga de página pública.
// Primera visita = primer touch; los UTM / click-ids se refrescan al último touch.
export function captureTracking(): Store {
  const p = new URLSearchParams(window.location.search)
  const s = load()
  const now = new Date().toISOString()
  if (!s.primeraVisita) s.primeraVisita = now
  s.ultimaVisita = now
  if (!s.landing) s.landing = window.location.href
  for (const [urlKey, field] of Object.entries({ ...CLICK_IDS, ...UTMS })) {
    const v = p.get(urlKey)
    if (v) s[field] = v
  }
  save(s)
  return s
}

// Payload de tracking completo (atribución persistida + contexto de página +
// cookies de Meta) listo para el formulario / la reserva. Nombres = campos del backend.
export function trackingParams(): Record<string, string | undefined> {
  const s = captureTracking()
  const cookies = fbCookies()
  const pantalla = window.screen ? `${window.screen.width}x${window.screen.height}` : undefined
  return {
    utmSource: s.utmSource, utmMedium: s.utmMedium, utmCampaign: s.utmCampaign,
    utmContent: s.utmContent, utmTerm: s.utmTerm,
    fbclid: s.fbclid, ctwaClid: s.ctwaClid, gclid: s.gclid, msclkid: s.msclkid,
    ttclid: s.ttclid, twclid: s.twclid, liFatId: s.liFatId, igclid: s.igclid, dclid: s.dclid,
    fbp: cookies.fbp, fbc: cookies.fbc,
    referrer: document.referrer || undefined,
    landing: s.landing || window.location.href,
    tituloPagina: document.title || undefined,
    pantalla,
    locale: navigator.language || undefined,
    primeraVisita: s.primeraVisita,
    ultimaVisita: s.ultimaVisita,
  }
}

export function genEventId(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
