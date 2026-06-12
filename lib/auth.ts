import { type NextAuthOptions, getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { peekLimit, registerFailure, resetLimit } from '@/lib/rate-limit'

// Protección anti fuerza bruta del login. Solo los intentos FALLIDOS
// consumen cupo; un login correcto resetea el contador del usuario.
const LOGIN_LIMIT    = { limit: 5,  windowMs: 15 * 60_000 } // por usuario
const LOGIN_IP_LIMIT = { limit: 30, windowMs: 15 * 60_000 } // por IP (cubre enumeración de usuarios)

function clientIpFromReq(req: unknown): string {
  const headers = (req as { headers?: Record<string, string | string[] | undefined> })?.headers
  const xf = headers?.['x-forwarded-for']
  const raw = Array.isArray(xf) ? xf[0] : (xf ?? '')
  return String(raw).split(',')[0].trim() || 'unknown'
}

export const authOptions: NextAuthOptions = {
  // Las sesiones expiran a las 12 horas: cubre la jornada de la clínica y
  // evita sesiones eternas en computadores compartidos de recepción.
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        slug: { label: 'Slug clínica', type: 'text' },
        username: { label: 'Usuario', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.password) return null

        const ip = clientIpFromReq(req)
        const ipKey = `login:ip:${ip}`
        const idKey = credentials.slug && credentials.username
          ? `login:${credentials.slug.toLowerCase()}:${credentials.username.toLowerCase()}`
          : `login:email:${(credentials.email ?? '').toLowerCase()}`

        // ¿Bloqueado por intentos previos? Avisamos cuánto falta (el cliente
        // muestra el mensaje amigable).
        const idCheck = peekLimit(idKey, LOGIN_LIMIT)
        const ipCheck = peekLimit(ipKey, LOGIN_IP_LIMIT)
        if (!idCheck.ok || !ipCheck.ok) {
          const retry = Math.max(idCheck.retryAfterSec, ipCheck.retryAfterSec)
          throw new Error(`RATE_LIMITED:${retry}`)
        }

        const fail = () => {
          registerFailure(idKey)
          registerFailure(ipKey)
          return null
        }

        // Modo 1: login por slug + username (acceso clínica)
        if (credentials.slug && credentials.username) {
          const clinica = await prisma.clinica.findUnique({ where: { slug: credentials.slug } })
          if (!clinica || !clinica.activo) return fail()

          const user = await prisma.user.findFirst({
            where: { clinicaId: clinica.id, username: credentials.username, activo: true },
          })
          if (!user) return fail()
          const valid = await bcrypt.compare(credentials.password, user.password)
          if (!valid) return fail()
          resetLimit(idKey)
          return userToToken(user)
        }

        // Modo 2: login por email (super-admin o usuario legacy con email)
        if (credentials.email) {
          const user = await prisma.user.findUnique({ where: { email: credentials.email } })
          if (!user || !user.activo) return fail()
          const valid = await bcrypt.compare(credentials.password, user.password)
          if (!valid) return fail()
          resetLimit(idKey)
          return userToToken(user)
        }

        return null
      },
    }),
  ],
  callbacks: {
    // Validación de URLs de redirect: por default NextAuth rechaza redirects
    // a hosts distintos de NEXTAUTH_URL. Como esto es multi-tenant con
    // subdominios (super-admin.clariva.cl, <slug>.clariva.cl, etc.) tenemos
    // que permitir explícitamente los subdominios de PLATFORM_DOMAIN.
    async redirect({ url, baseUrl }) {
      // URL relativa → prepend baseUrl
      if (url.startsWith('/')) return `${baseUrl}${url}`

      try {
        const parsed = new URL(url)
        const host = parsed.hostname.toLowerCase()
        const platformDomain = (process.env.PLATFORM_DOMAIN ?? '').toLowerCase()
        const baseHost = new URL(baseUrl).hostname.toLowerCase()

        // Permitir si es el mismo host que NEXTAUTH_URL
        if (host === baseHost) return url

        // Permitir si es el PLATFORM_DOMAIN o cualquier subdominio
        if (platformDomain) {
          if (host === platformDomain || host.endsWith(`.${platformDomain}`)) return url
        }
      } catch {
        // URL inválida
      }
      return baseUrl
    },
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.clinicaId = (user as any).clinicaId ?? null
        token.isPlatformAdmin = (user as any).isPlatformAdmin ?? false
        token.requirePasswordChange = (user as any).requirePasswordChange ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).clinicaId = token.clinicaId ?? null;
        (session.user as any).isPlatformAdmin = token.isPlatformAdmin ?? false;
        (session.user as any).requirePasswordChange = token.requirePasswordChange ?? false
      }
      return session
    },
  },
}

function userToToken(user: any) {
  return {
    id: user.id,
    name: user.name ?? '',
    email: user.email ?? '',
    role: user.role,
    clinicaId: user.clinicaId ?? null,
    isPlatformAdmin: user.isPlatformAdmin ?? false,
    requirePasswordChange: user.passwordChangedAt === null,
  } as any
}

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: string
  clinicaId: string | null
  isPlatformAdmin: boolean
  requirePasswordChange: boolean
  puedeModificarPrecio: boolean
  puedeAplicarDescuento: boolean
  puedeRevertirCompletado: boolean
  puedeEditarPagos: boolean
  puedeGestionarLiquidaciones: boolean
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const u = session.user as any
  if (!u.id) return null

  // Permisos los leemos en cada request (el JWT es estable hasta nuevo login).
  // role 'admin' implica los dos permisos para evitar configuración por separado.
  let puedeModificarPrecio = false
  let puedeAplicarDescuento = false
  let puedeRevertirCompletado = false
  let puedeEditarPagos = false
  let puedeGestionarLiquidaciones = false
  if (u.clinicaId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: u.id },
      select: { puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true, puedeEditarPagos: true, puedeGestionarLiquidaciones: true, role: true },
    })
    if (dbUser) {
      const isAdmin = dbUser.role === 'admin'
      puedeModificarPrecio = isAdmin || dbUser.puedeModificarPrecio
      puedeAplicarDescuento = isAdmin || dbUser.puedeAplicarDescuento
      puedeRevertirCompletado = isAdmin || dbUser.puedeRevertirCompletado
      puedeEditarPagos = isAdmin || dbUser.puedeEditarPagos
      puedeGestionarLiquidaciones = isAdmin || dbUser.puedeGestionarLiquidaciones
    }
  }

  return {
    id: u.id,
    email: u.email ?? '',
    name: u.name ?? null,
    role: u.role,
    clinicaId: u.clinicaId ?? null,
    isPlatformAdmin: u.isPlatformAdmin ?? false,
    requirePasswordChange: u.requirePasswordChange ?? false,
    puedeModificarPrecio,
    puedeAplicarDescuento,
    puedeRevertirCompletado,
    puedeEditarPagos,
    puedeGestionarLiquidaciones,
  }
}

export async function requireClinicaId(): Promise<string | null> {
  const u = await getSessionUser()
  return u?.clinicaId ?? null
}

export async function requireSuperAdmin(): Promise<SessionUser | null> {
  const u = await getSessionUser()
  return u?.isPlatformAdmin ? u : null
}
