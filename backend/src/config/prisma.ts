import { PrismaClient } from '@prisma/client'

const CONNECTION_LIMIT = 10

const dbUrl = process.env.DATABASE_URL!
const poolUrl = dbUrl.includes('?')
  ? `${dbUrl}&connection_limit=${CONNECTION_LIMIT}`
  : `${dbUrl}?connection_limit=${CONNECTION_LIMIT}`

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: poolUrl,
    },
  },
})
