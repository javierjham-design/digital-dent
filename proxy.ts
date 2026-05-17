import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_API = ['/api/auth']
const SUPER_ADMIN_LOGIN = '/digital-dent-admin-login'
const SUPER_ADMIN_PREFIX = '/digital-dent-super-admin'

// Subdominios que NO son clínicas. Cada uno tiene un comportamiento dedicado.
// Si añades alguno, también actualiza RESERVED_SLUGS en /api/admin/clinicas.
const RESERVED_SUBDOMAINS = new Set([
  'super-admin', // panel super-admin
  'www',         // landing pública
  'admin',       // alias futuro
  'api',         // alias futuro
  'app',         // alias futuro
  'mail',
])

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? ''

function extractSubdomain(host: string | null): string | null {
  if (!host || !PLATFORM_DOMAIN) return null
  const hostNoPort = host.split(':')[0].toLowerCase()
  const domain = PLATFORM_DOMAIN.toLowerCase()
  if (hostNoPort === domain) return null
  if (!hostNoPort.endsWith(`.${domain}`)) return null
  const sub = hostNoPort.slice(0, hostNoPort.length - domain.length - 1)
  if (sub.includes('.')) return null // no aceptamos sub-sub-dominios
  return sub
}

function extractPathSlug(pathname: string): { slug: string | null; rewriteTo: string | null } {
  const match = pathname.match(/^\/c\/([a-z0-9-]+)(\/.*)?$/i)
  if (!match) return { slug: null, rewriteTo: null }
  return { slug: match[1], rewriteTo: match[2] || '/' }
}

type Context =
  | { kind: 'landing' }                                            // www.dominio.cl o dominio.cl
  | { kind: 'super-admin' }                                        // super-admin.dominio.cl
  | { kind: 'clinica-subdomain'; slug: string }                    // <slug>.dominio.cl
  | { kind: 'clinica-path'; slug: string; rewriteTo: string }      // /c/<slug>/...
  | { kind: 'global' }                                             // sin subdominio y sin path /c/

function resolveContext(host: string | null, path: string): Context {
  const sub = extractSubdomain(host)
  if (sub === 'super-admin') return { kind: 'super-admin' }
  if (sub === 'www' || sub === null) {
    // Sin subdominio o www: si el path es /c/<slug>/..., es modo fallback de clínica.
    const p = extractPathSlug(path)
    if (p.slug && p.rewriteTo) return { kind: 'clinica-path', slug: p.slug, rewriteTo: p.rewriteTo }
    return sub === 'www' ? { kind: 'landing' } : { kind: 'global' }
  }
  if (RESERVED_SUBDOMAINS.has(sub)) {
    // Reservado pero sin manejo dedicado: tratar como landing.
    return { kind: 'landing' }
  }
  // Cualquier otro subdominio = clínica.
  return { kind: 'clinica-subdomain', slug: sub }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const host = request.headers.get('host')
  const ctx = resolveContext(host, path)

  // APIs públicas: pasar siempre, inyectando slug si aplica.
  if (PUBLIC_API.some((p) => path.startsWith(p))) {
    const res = NextResponse.next()
    const slug = ctx.kind === 'clinica-subdomain' || ctx.kind === 'clinica-path' ? ctx.slug : null
    if (slug) res.headers.set('x-clinica-slug', slug)
    return res
  }

  // ── SUPER-ADMIN (subdominio super-admin.dominio.cl) ─────────────────
  if (ctx.kind === 'super-admin') {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    const isSuperAdmin = Boolean(token && (token as { isPlatformAdmin?: boolean }).isPlatformAdmin)

    // Rewrite: / → /digital-dent-super-admin, /login → /digital-dent-admin-login, /<resto> → /digital-dent-super-admin/<resto>
    const isLoginPath = path === '/login' || path === SUPER_ADMIN_LOGIN
    if (isLoginPath) {
      if (token && isSuperAdmin) {
        // Ya logueado como super-admin: ir al panel
        return rewrite(request, '/digital-dent-super-admin')
      }
      return rewrite(request, SUPER_ADMIN_LOGIN)
    }

    if (!token || !isSuperAdmin) {
      return rewrite(request, SUPER_ADMIN_LOGIN)
    }

    // Auth OK: rewrite todo al prefijo del panel
    if (path === '/' || path === '') return rewrite(request, SUPER_ADMIN_PREFIX)
    if (path.startsWith(SUPER_ADMIN_PREFIX)) return NextResponse.next()
    return rewrite(request, `${SUPER_ADMIN_PREFIX}${path}`)
  }

  // ── LANDING (www.dominio.cl o dominio.cl) ───────────────────────────
  if (ctx.kind === 'landing') {
    // Solo permitimos / y rutas estáticas. Si entran a /login u otra cosa, rebotamos a /.
    if (path === '/' || path === '') return NextResponse.next()
    // /digital-dent-admin-login y /digital-dent-super-admin no están accesibles desde aquí.
    if (path === SUPER_ADMIN_LOGIN || path.startsWith(SUPER_ADMIN_PREFIX)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.redirect(new URL('/', request.url))
  }

  // ── CLÍNICA POR SUBDOMINIO (<slug>.dominio.cl) ──────────────────────
  if (ctx.kind === 'clinica-subdomain') {
    return handleClinicaRoute(request, { slug: ctx.slug, isPath: false })
  }

  // ── CLÍNICA POR PATH (/c/<slug>/...) ────────────────────────────────
  if (ctx.kind === 'clinica-path') {
    return handleClinicaRoute(request, { slug: ctx.slug, isPath: true, rewriteTo: ctx.rewriteTo })
  }

  // ── GLOBAL (sin dominio configurado ni path /c/) ────────────────────
  // Compatibilidad: si entran al super-admin login o panel por path, manejamos aquí.
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const isSuperAdmin = Boolean(token && (token as { isPlatformAdmin?: boolean }).isPlatformAdmin)
  const isSuperAdminArea = path === SUPER_ADMIN_PREFIX || path.startsWith(`${SUPER_ADMIN_PREFIX}/`)

  if (path === SUPER_ADMIN_LOGIN) {
    if (token && isSuperAdmin) return NextResponse.redirect(new URL(SUPER_ADMIN_PREFIX, request.url))
    return NextResponse.next()
  }
  if (isSuperAdminArea) {
    if (!token || !isSuperAdmin) return NextResponse.redirect(new URL(SUPER_ADMIN_LOGIN, request.url))
    return NextResponse.next()
  }
  if (path === '/login') {
    // /login sin contexto: muestra landing neutra (lo maneja la propia página).
    return NextResponse.next()
  }
  if (path === '/') {
    // Landing pública en el root global también
    return NextResponse.next()
  }
  // Cualquier otra ruta sin contexto: si no hay token, mandar a /login (landing).
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

function rewrite(request: NextRequest, pathname: string): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  return NextResponse.rewrite(url)
}

async function handleClinicaRoute(
  request: NextRequest,
  opts: { slug: string; isPath: true; rewriteTo: string } | { slug: string; isPath: false },
): Promise<NextResponse> {
  const { slug } = opts
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  // Determinar el path "lógico" dentro de la clínica.
  const logicalPath = opts.isPath ? opts.rewriteTo : request.nextUrl.pathname
  const isLogin = logicalPath === '/login'

  // /login de la clínica: público.
  if (isLogin) {
    // Si hay sesión activa, dejamos pasar y avisamos en el cliente.
    if (token) {
      const res = opts.isPath
        ? rewrite(request, '/login')
        : NextResponse.next()
      res.headers.set('x-clinica-slug', slug)
      res.headers.set('x-session-active', (token as { isPlatformAdmin?: boolean }).isPlatformAdmin ? 'super-admin' : 'clinica')
      return res
    }
    const res = opts.isPath ? rewrite(request, '/login') : NextResponse.next()
    res.headers.set('x-clinica-slug', slug)
    return res
  }

  // Resto de rutas de la clínica: requieren sesión.
  if (!token) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = opts.isPath ? `/c/${slug}/login` : '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Sesión OK: rewrite si vino por path, set header.
  const res = opts.isPath ? rewrite(request, opts.rewriteTo) : NextResponse.next()
  res.headers.set('x-clinica-slug', slug)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
