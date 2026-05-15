import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = ['/login']
const PUBLIC_API = ['/api/auth']

// PLATFORM_DOMAIN debe contener tu dominio raíz cuando esté configurado,
// por ejemplo "tudominio.cl". Hasta entonces, el modo "subdomain" no se activa
// y todo funciona por path (/c/<slug>/...).
const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? ''

function extractSubdomain(host: string | null): string | null {
  if (!host || !PLATFORM_DOMAIN) return null
  // Quita puerto si existe
  const hostNoPort = host.split(':')[0].toLowerCase()
  const domain = PLATFORM_DOMAIN.toLowerCase()
  if (hostNoPort === domain || hostNoPort === `www.${domain}`) return null
  if (!hostNoPort.endsWith(`.${domain}`)) return null
  const sub = hostNoPort.slice(0, hostNoPort.length - domain.length - 1)
  // Solo aceptamos un nivel de subdominio
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

  // Resolver clínica desde subdomain o path
  const subdomain = extractSubdomain(host)
  const pathInfo = extractPathSlug(path)
  const slug = subdomain ?? pathInfo.slug

  // Si vino por path /c/<slug>/..., reescribir internamente para servir el contenido real
  // pero conservando el slug en un header.
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
  const isPublicPage = PUBLIC_PATHS.includes(path) || (pathInfo.rewriteTo && PUBLIC_PATHS.includes(pathInfo.rewriteTo))

  if (!token && !isPublicPage) {
    // Redirigir a login del contexto correcto
    const loginUrl = request.nextUrl.clone()
    if (slug && !subdomain) {
      loginUrl.pathname = `/c/${slug}/login`
    } else {
      loginUrl.pathname = '/login'
    }
    return NextResponse.redirect(loginUrl)
  }

  if (token && isPublicPage) {
    const home = request.nextUrl.clone()
    home.pathname = slug && !subdomain ? `/c/${slug}/` : '/'
    return NextResponse.redirect(home)
  }

  const res = rewriteUrl ? NextResponse.rewrite(rewriteUrl) : NextResponse.next()
  if (slug) res.headers.set('x-clinica-slug', slug)
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
