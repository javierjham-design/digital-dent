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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })
        if (!user) return null
        if (!user.activo) return null
        const valid = await bcrypt.compare(credentials.password, user.password)
        if (!valid) return null
        return {
          id: user.id,
          name: user.name ?? '',
          email: user.email,
          role: user.role,
          clinicaId: user.clinicaId ?? null,
          isPlatformAdmin: user.isPlatformAdmin ?? false,
        } as any
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
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).clinicaId = token.clinicaId ?? null;
        (session.user as any).isPlatformAdmin = token.isPlatformAdmin ?? false
      }
      return session
    },
  },
}

export type SessionUser = {
  id: string
  email: string
  name: string | null
  role: string
  clinicaId: string | null
  isPlatformAdmin: boolean
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const u = session.user as any
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role: u.role,
    clinicaId: u.clinicaId ?? null,
    isPlatformAdmin: u.isPlatformAdmin ?? false,
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
