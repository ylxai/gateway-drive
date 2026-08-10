import { prisma } from '../config/prisma.js'

async function main() {
  const config = await prisma.providerConfig.findFirst({
    where: { provider: 'google_drive', userId: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!config) {
    console.log('No config found')
    process.exit(0)
  }

  const update = await prisma.providerConfig.update({
    where: { id: config.id },
    data: { redirectUri: 'https://priday-farelya-workspace-9drive.tose.sh/connected-accounts/google/callback' },
  })

  console.log(`Updated redirect URI to: ${update.redirectUri}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
