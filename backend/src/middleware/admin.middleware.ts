import type { NextFunction, Response } from 'express'
import { env } from '../config/env.js'
import type { AuthRequest } from './auth.middleware.js'

const adminIds = new Set(
  (env.ADMIN_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
)

export function isAdmin(userId: string) {
  return adminIds.size === 0 ? false : adminIds.has(userId)
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !isAdmin(req.user.id)) {
    return res.status(403).json({ code: 'ADMIN_REQUIRED', message: 'Admin access required.' })
  }
  return next()
}
