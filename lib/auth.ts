import { type NextAuthOptions, getServerSession } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
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
      async authorize(credentials) {
        if (!credentials?.password) return null

        // Modo 1: login por slug + username (acceso clínica)
        if (credentials.slug && credentials.username) {
          const clinica = await prisma.clinica.findUnique({ where: { slug: credentials.slug } })
          if (!clinica || !clinica.activo) return null

          const user = await prisma.user.findFirst({
            where: { clinicaId: clinica.id, username: credentials.username, activo: true },
          })
          if (!user) return null
          const valid = await bcrypt.compare(credentials.password, user.password)
          if (!valid) return null
          return userToToken(user)
        }

        // Modo 2: login por email (super-admin o usuario legacy con email)
        if (credentials.email) {
          const user = await prisma.user.findUnique({ where: { email: credentials.email } })
          if (!user || !user.activo) return null
          const valid = await bcrypt.compare(credentials.password, user.password)
          if (!valid) return null
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
  if (u.clinicaId) {
    const dbUser = await prisma.user.findUnique({
      where: { id: u.id },
      select: { puedeModificarPrecio: true, puedeAplicarDescuento: true, puedeRevertirCompletado: true, role: true },
    })
    if (dbUser) {
      const isAdmin = dbUser.role === 'admin'
      puedeModificarPrecio = isAdmin || dbUser.puedeModificarPrecio
      puedeAplicarDescuento = isAdmin || dbUser.puedeAplicarDescuento
      puedeRevertirCompletado = isAdmin || dbUser.puedeRevertirCompletado
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
