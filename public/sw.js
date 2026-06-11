// Service Worker de Cláriva
// ────────────────────────────────────────────────────────────────────────────
// Cláriva maneja datos clínicos y financieros sensibles. La política de caché
// es CONSERVADORA: nunca cacheamos HTML ni respuestas de la API. Solo cacheamos
// assets inmutables de Next.js y los íconos. Así evitamos que un usuario
// deslogueado vea pantallas cacheadas o totales obsoletos.
//
// Subir el VERSION invalida toda la caché vieja en el siguiente activate.

const VERSION = 'v1'
const STATIC_CACHE = `clariva-static-${VERSION}`

// Recursos que SÍ cacheamos (assets inmutables, fingerprinted por Next.js).
function esCacheable(url) {
  const u = new URL(url)
  if (u.origin !== self.location.origin) return false
  if (u.pathname.startsWith('/_next/static/')) return true
  if (u.pathname.startsWith('/icons/'))       return true
  if (u.pathname === '/manifest.webmanifest') return true
  if (u.pathname === '/manifest.json')        return true
  return false
}

self.addEventListener('install', (event) => {
  // Activarse inmediatamente sin esperar a que se cierren pestañas viejas.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys()
      await Promise.all(
        nombres
          .filter((n) => n.startsWith('clariva-') && n !== STATIC_CACHE)
          .map((n) => caches.delete(n)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request

  // Solo procesamos GET. El resto (POST/PUT/DELETE) va a red sin tocar.
  if (req.method !== 'GET') return

  // Cualquier URL no cacheable (HTML, API, etc.) va directo a la red.
  // No interceptamos para no introducir bugs ni latencia extra.
  if (!esCacheable(req.url)) return

  // Para assets cacheables: cache-first con revalidación silenciosa en background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      const cacheado = await cache.match(req)
      if (cacheado) {
        // Refresca en background para próximas visitas.
        event.waitUntil(
          fetch(req)
            .then((res) => { if (res.ok) cache.put(req, res.clone()) })
            .catch(() => { /* offline: usamos el cacheado */ }),
        )
        return cacheado
      }
      try {
        const res = await fetch(req)
        if (res.ok) cache.put(req, res.clone())
        return res
      } catch {
        // Offline y sin caché previo: devolvemos error de red estándar.
        return new Response('', { status: 504, statusText: 'Offline' })
      }
    })(),
  )
})

// Permite que la página fuerce el skipWaiting cuando hay un SW pendiente.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
