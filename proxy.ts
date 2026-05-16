import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = ['/login', '/digital-dent-admin-login']
const PUBLIC_API = ['/api/auth']
const SUPER_ADMIN_LOGIN = '/digital-dent-admin-login'
const SUPER_ADMIN_PREFIX = '/digital-dent-super-admin'

// PLATFORM_DOMAIN debe contener tu dominio raíz cuando esté configurado,
// por ejemplo "tudominio.cl". Hasta entonces, el modo "subdomain" no se activa
// y todo funciona por path (/c/<slug>/...).
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? ''

function extractSubdomain(host: string | null): string | null {
  if (!host || !PLATFORM_DOMAIN) return null
  const hostNoPort = host.split(':')[0].toLowerCase()
  const domain = PLATFORM_DOMAIN.toLowerCase()
  if (hostNoPort === domain || hostNoPort === `www.${domain}`) return null
  if (!hostNoPort.endsWith(`.${domain}`)) return null
  const sub = hostNoPort.slice(0, hostNoPort.length - domain.length - 1)
  if (sub.includes('.')) return null
  return sub
}

function extractPathSlug(pathname: string): { slug: string | null; rewriteTo: string | null } {
  // Formato: /c/<slug>/...resto
  const match = pathname.match(/^\/c\/([a-z0-9-]+)(\/.*)?$/i)
  if (!match) return { slug: null, rewriteTo: null }
  return { slug: match[1], rewriteTo: match[2] || '/' }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const host = request.headers.get('host')

  const subdomain = extractSubdomain(host)
  const pathInfo = extractPathSlug(path)
  const slug = subdomain ?? pathInfo.slug

  let rewriteUrl: URL | null = null
  if (pathInfo.slug && pathInfo.rewriteTo) {
    rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = pathInfo.rewriteTo
  }

  // APIs públicas: siempre pasar
  if (PUBLIC_API.some((p) => path.startsWith(p))) {
    const res = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next()
    if (slug) res.headers.set('x-clinica-slug', slug)
    return res
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const effectivePath = pathInfo.rewriteTo ?? path
  const isPublicPage = PUBLIC_PATHS.includes(path) || (pathInfo.rewriteTo != null && PUBLIC_PATHS.includes(pathInfo.rewriteTo))
  const isSuperAdminArea = effectivePath === SUPER_ADMIN_PREFIX || effectivePath.startsWith(`${SUPER_ADMIN_PREFIX}/`)

  if (!token && !isPublicPage) {
    const loginUrl = request.nextUrl.clone()
    if (isSuperAdminArea) {
      loginUrl.pathname = SUPER_ADMIN_LOGIN
    } else if (slug && !subdomain) {
      loginUrl.pathname = `/c/${slug}/login`
    } else if (slug && subdomain) {
      loginUrl.pathname = '/login'
    } else {
      // Sin contexto de clínica ni de super-admin: no hay a dónde redirigir con sentido.
      // Mandamos a /login (que mostrará landing neutra sin form).
      loginUrl.pathname = '/login'
    }
    return NextResponse.redirect(loginUrl)
  }

  if (token && isPublicPage) {
    const home = request.nextUrl.clone()
    if (effectivePath === SUPER_ADMIN_LOGIN) {
      home.pathname = SUPER_ADMIN_PREFIX
    } else if (slug && !subdomain) {
      home.pathname = `/c/${slug}/`
    } else {
      home.pathname = '/'
    }
    return NextResponse.redirect(home)
  }

  const res = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next()
  if (slug) res.headers.set('x-clinica-slug', slug)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
