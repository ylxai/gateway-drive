import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  if (!origin && !referer) return next()

  const originHost = origin ? new URL(origin).origin : null
  const refererHost = referer ? new URL(referer).origin : null
  const frontendOrigin = new URL(env.FRONTEND_URL).origin

  if (originHost && originHost !== frontendOrigin) {
    return res.status(403).json({ code: 'CSRF_ORIGIN_MISMATCH', message: 'Invalid origin.' })
  }
  if (!originHost && refererHost && refererHost !== frontendOrigin) {
    return res.status(403).json({ code: 'CSRF_ORIGIN_MISMATCH', message: 'Invalid origin.' })
  }

  next()
}
