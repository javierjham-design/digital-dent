import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = ['/login', '/registro']
const PUBLIC_API = ['/api/auth', '/api/clinicas']

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const path = request.nextUrl.pathname

  if (PUBLIC_API.some((p) => path.startsWith(p))) return NextResponse.next()

  const isPublicPage = PUBLIC_PATHS.includes(path)

  if (!token && !isPublicPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (token && isPublicPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
