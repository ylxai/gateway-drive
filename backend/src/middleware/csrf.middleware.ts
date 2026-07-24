import type { Request, Response, NextFunction } from 'express'
import { env } from '../config/env.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next()

  const origin = req.headers.origin
  const referer = req.headers.referer

  if (!origin && !referer) return next()

  try {
    const originHost = parseOrigin(origin)
    const refererHost = parseOrigin(referer)
    const frontendOrigin = parseOrigin(env.FRONTEND_URL)

    if (originHost && originHost !== frontendOrigin) {
      return res.status(403).json({ code: 'CSRF_ORIGIN_MISMATCH', message: 'Invalid origin.' })
    }
    if (!originHost && refererHost && refererHost !== frontendOrigin) {
      return res.status(403).json({ code: 'CSRF_ORIGIN_MISMATCH', message: 'Invalid origin.' })
    }
  } catch {
    return res.status(403).json({ code: 'CSRF_INVALID_HEADER', message: 'Malformed request header.' })
  }

  next()
}

function parseOrigin(value: string | undefined) {
  if (!value) return null
  try { return new URL(value).origin } catch { return null }
}
