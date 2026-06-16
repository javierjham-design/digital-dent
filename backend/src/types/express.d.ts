import type { JwtPayload } from '@/services/auth.service'

// Adjunta el payload del JWT a cada request autenticada.
declare global {
  namespace Express {
    interface Request {
      auth?: JwtPayload
    }
  }
}

export {}
