import type { Request, Response, NextFunction, RequestHandler } from 'express'

// Envuelve handlers async para que los throws/rejects vayan al error middleware
// sin try/catch repetidos en cada controller.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next)
  }
