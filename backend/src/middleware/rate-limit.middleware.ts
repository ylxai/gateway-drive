import rateLimit from 'express-rate-limit'
import type { Request } from 'express'
import { verifyAccessToken } from '../utils/jwt.js'
import type { AuthRequest } from './auth.middleware.js'

/**
 * Rate-limit key: prefer the authenticated user id so users behind a shared
 * NAT/IP are not collectively locked out. Falls back to the proxied IP for
 * anonymous traffic (login/register, public routes).
 */
function keyGenerator(req: Request): string {
  // When auth middleware has already populated req.user, use it directly to
  // avoid re-parsing/re-verifying the JWT on every request.
  const authReq = req as AuthRequest
  if (authReq.user?.id) return `user:${authReq.user.id}`
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(authHeader.slice(7))
      if (payload?.sub) return `user:${payload.sub}`
    } catch {
      // Invalid/expired token → treat as anonymous
    }
  }
  return `ip:${req.ip ?? 'unknown'}`
}

/**
 * General API rate limiter — 100 requests per 15 minutes per key.
 * Applied globally to all routes except /health.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/healthz',
  message: { code: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' },
})

/**
 * Auth rate limiter — strict limits for login/register/token endpoints.
 * 10 requests per 15 minutes per key.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT_AUTH', message: 'Too many authentication attempts. Please try again later.' },
})

/**
 * Upload rate limiter — 30 uploads per 15 minutes per key.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT_UPLOAD', message: 'Too many uploads. Please try again later.' },
})
