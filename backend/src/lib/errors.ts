// Errores de dominio con código HTTP. Los services lanzan estos; el
// middleware de errores los traduce a respuestas JSON limpias.
export class AppError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (msg: string) => new AppError(400, msg)
export const unauthorized = (msg = 'No autorizado') => new AppError(401, msg)
export const forbidden = (msg = 'Sin permisos') => new AppError(403, msg)
export const notFound = (msg = 'No encontrado') => new AppError(404, msg)
export const conflict = (msg: string) => new AppError(409, msg)
export const tooMany = (msg: string) => new AppError(429, msg)
