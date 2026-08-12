import type { Prisma } from '@prisma/client'
import { prisma } from '../config/prisma.js'

export async function createAuditLog(userId: string, action: string, entityType: string, entityId?: string, metadata?: Prisma.InputJsonValue) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        metadata: metadata ?? undefined
      }
    })
  } catch (error) {
    console.error('Failed to create audit log:', error)
  }
}
