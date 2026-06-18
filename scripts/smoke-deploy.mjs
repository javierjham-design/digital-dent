// Smoke-test post-deploy: valida los 3 servicios en vivo tras el cutover.
// No modifica nada (solo GET y un POST de validación sin efectos persistentes).
//
// Uso (con dominios definitivos):
//   API_URL=https://api.clariva.cl WEB_URL=https://clariva.cl \
//   APP_URL=https://demo.clariva.cl PLATFORM_DOMAIN=clariva.cl \
//   node scripts/smoke-deploy.mjs
//
// Durante la validación previa al DNS, pasar las URLs *.up.railway.app.
// APP_URL = cualquier subdominio de clínica (sirve la SPA en cualquiera).

const API = (process.env.API_URL ?? '').replace(/\/$/, '')
const WEB = (process.env.WEB_URL ?? '').replace(/\/$/, '')
const APP = (process.env.APP_URL ?? '').replace(/\/$/, '')
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? ''

if (!API) { console.error('Falta API_URL'); process.exit(2) }

let fallos = 0
const ok = (n) => console.log(`  \x1b[32m✓\x1b[0m ${n}`)
const fail = (n, d) => { console.log(`  \x1b[31m✗\x1b[0m ${n}${d ? ` — ${d}` : ''}`); fallos++ }

async function check(nombre, fn) {
  try { (await fn()) ? ok(nombre) : fail(nombre) }
  catch (e) { fail(nombre, e instanceof Error ? e.message : String(e)) }
}

console.log(`\nBackend (${API})`)
await check('GET /health → 200 ok', async () => {
  const r = await fetch(`${API}/health`)
  const j = await r.json().catch(() => ({}))
  return r.status === 200 && j.ok === true
})
await check('GET /api/v1/planes → 200 con planes', async () => {
  const r = await fetch(`${API}/api/v1/planes`)
  const j = await r.json().catch(() => ({}))
  return r.status === 200 && Array.isArray(j.planes)
})
await check('GET /api/v1/pacientes sin token → 401', async () => {
  const r = await fetch(`${API}/api/v1/pacientes`)
  return r.status === 401
})
if (PLATFORM_DOMAIN) {
  await check('CORS permite un subdominio de clínica', async () => {
    const origin = `https://demo-clinica.${PLATFORM_DOMAIN}`
    const r = await fetch(`${API}/health`, { headers: { Origin: origin } })
    return r.headers.get('access-control-allow-origin') === origin
  })
  await check('CORS rechaza un origen ajeno', async () => {
    const r = await fetch(`${API}/health`, { headers: { Origin: 'https://evil.example.com' } })
    return r.headers.get('access-control-allow-origin') !== 'https://evil.example.com'
  })
}

if (WEB) {
  console.log(`\nWeb / landing (${WEB})`)
  await check('GET / → 200 html', async () => {
    const r = await fetch(WEB)
    return r.status === 200 && (r.headers.get('content-type') ?? '').includes('html')
  })
  await check('GET /landing-1 → 200 (fallback SPA)', async () => {
    const r = await fetch(`${WEB}/landing-1`)
    return r.status === 200
  })
}

if (APP) {
  console.log(`\nFrontend SPA (${APP})`)
  await check('GET / → 200 html', async () => {
    const r = await fetch(APP)
    return r.status === 200 && (r.headers.get('content-type') ?? '').includes('html')
  })
  await check('GET /agenda → 200 (fallback SPA)', async () => {
    const r = await fetch(`${APP}/agenda`)
    return r.status === 200
  })
}

console.log('')
if (fallos > 0) { console.error(`✗ ${fallos} check(s) fallaron.`); process.exit(1) }
console.log('✓ Todos los checks pasaron.')
