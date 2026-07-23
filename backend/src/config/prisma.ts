import { PrismaClient } from '@prisma/client'
import { env } from './env.js'

const connectionLimit = parseInt(process.env.PRISMA_CONNECTION_LIMIT || '10', 10)

const dbUrl = env.DATABASE_URL
const poolUrl = new URL(dbUrl)
poolUrl.searchParams.set('connection_limit', String(connectionLimit))

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: poolUrl.toString(),
    },
  },
})
