import rateLimit from 'express-rate-limit'

/**
 * General API rate limiter — 100 requests per 15 minutes per IP.
 * Applied globally to all routes except /health.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT', message: 'Too many requests. Please try again later.' },
})

/**
 * Auth rate limiter — strict limits for login/register/token endpoints.
 * 10 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT_AUTH', message: 'Too many authentication attempts. Please try again later.' },
})

/**
 * Upload rate limiter — 30 uploads per 15 minutes per IP.
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'RATE_LIMIT_UPLOAD', message: 'Too many uploads. Please try again later.' },
})
