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
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const u = session.user as any
  return {
    id: u.id,
    email: u.email ?? '',
    name: u.name ?? null,
    role: u.role,
    clinicaId: u.clinicaId ?? null,
    isPlatformAdmin: u.isPlatformAdmin ?? false,
    requirePasswordChange: u.requirePasswordChange ?? false,
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
