import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

function isPrismaNotFound(error: unknown) {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2025'
}

function isPrismaUniqueViolation(error: unknown) {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002'
}

export function errorMiddleware(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Invalid request payload.', issues })
  }

  if (isPrismaNotFound(error)) {
    return res.status(404).json({ code: 'NOT_FOUND', message: 'Resource not found.' })
  }

  if (isPrismaUniqueViolation(error)) {
    return res.status(409).json({ code: 'CONFLICT', message: 'A record with the same unique value already exists.' })
  }

  // Log the real error server-side; never leak internal details to the client.
  console.error('[error]', error instanceof Error ? error.stack ?? error.message : error)
  return res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' })
}
