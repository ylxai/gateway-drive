import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { requireAuth } from '../../middleware/auth.middleware.js'
import { prisma } from '../../config/prisma.js'
import { decryptText, encryptText } from '../../utils/crypto.js'
import { env } from '../../config/env.js'

export const systemRouter = Router()


systemRouter.post('/update', requireAuth, (req, res) => {
  return res.status(410).json({
    code: 'UPDATE_DEPRECATED',
    message: 'The in-app update feature is deprecated for security reasons. Please update by running "git pull" directly on your server.'
  })
})

systemRouter.get('/update-log', requireAuth, (req, res) => {
  const projectRoot = path.resolve(process.cwd(), '..')
  const logFile = path.join(projectRoot, 'update.log')

  if (!fs.existsSync(logFile)) {
    return res.json({
      log: 'No update history found.'
    })
  }

  try {
    const logContent = fs.readFileSync(logFile, 'utf8')
    return res.json({
      log: logContent
    })
  } catch (error: any) {
    return res.status(500).json({
      code: 'READ_LOG_FAILED',
      message: 'Failed to read update log file.',
      error: error.message
    })
  }
})

systemRouter.get('/google-config', requireAuth, async (req, res, next) => {
  try {
    const config = await prisma.providerConfig.findFirst({
      where: { userId: null, provider: 'google_drive', status: 'active' },
      orderBy: { createdAt: 'desc' }
    })

    const defaultRedirect = `${req.protocol}://${req.get('host')}/connected-accounts/google/callback`

    if (!config) {
      return res.json({
        exists: false,
        defaultRedirectUri: defaultRedirect
      })
    }

    let clientId = ''
    try {
      clientId = decryptText(config.clientIdEncrypted)
    } catch {
      clientId = ''
    }

    return res.json({
      exists: true,
      clientId,
      redirectUri: config.redirectUri,
      hasSecret: !!config.clientSecretEncrypted,
      defaultRedirectUri: defaultRedirect
    })
  } catch (error) {
    return next(error)
  }
})

systemRouter.post('/google-config', requireAuth, async (req, res, next) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body

    if (!clientId) {
      return res.status(400).json({ code: 'BAD_REQUEST', message: 'Client ID is required.' })
    }

    const defaultRedirect = `${req.protocol}://${req.get('host')}/connected-accounts/google/callback`
    const finalRedirectUri = redirectUri || defaultRedirect

    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ]

    // Disable old global active config
    await prisma.providerConfig.updateMany({
      where: { userId: null, provider: 'google_drive', status: 'active' },
      data: { status: 'disabled' }
    })

    // Retrieve the old config to see if we need to reuse the secret if it was not provided in the request
    let finalSecret = clientSecret
    if (!finalSecret) {
      const oldConfig = await prisma.providerConfig.findFirst({
        where: { userId: null, provider: 'google_drive', status: 'disabled' },
        orderBy: { createdAt: 'desc' }
      })
      if (oldConfig) {
        try {
          finalSecret = decryptText(oldConfig.clientSecretEncrypted)
        } catch {
          // ignore
        }
      }
    }

    if (!finalSecret) {
      return res.status(400).json({ code: 'BAD_REQUEST', message: 'Client Secret is required for first-time setup.' })
    }

    const config = await prisma.providerConfig.create({
      data: {
        userId: null,
        provider: 'google_drive',
        clientIdEncrypted: encryptText(clientId),
        clientSecretEncrypted: encryptText(finalSecret),
        redirectUri: finalRedirectUri,
        scopes,
        status: 'active'
      }
    })

    return res.status(201).json({
      status: 'success',
      message: 'Global Google OAuth configuration updated successfully.',
      id: config.id
    })
  } catch (error) {
    return next(error)
  }
})

systemRouter.get('/backup', requireAuth, (_req, res, next) => {
  try {
    const dbUrl = env.DATABASE_URL
    const match = dbUrl.match(/postgres(?:ql)?:\/\/([^:]+):[^@]+@([^:]+):(\d+)\/(.+)/)
    if (!match) {
      return res.status(400).json({
        code: 'UNSUPPORTED_DATABASE',
        message: 'Automatic backup is only available for PostgreSQL.'
      })
    }
    const [, user, host, port, dbname] = match

    return res.json({
      status: 'ok',
      message: 'To backup your PostgreSQL database, run the following command on your server:',
      command: `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbname} -F c -f 9drive-backup.dump`,
      note: 'Set the PGPASSWORD environment variable before running this command. Do not pass the password on the command line.'
    })
  } catch (error) {
    return next(error)
  }
})

systemRouter.post('/restore', requireAuth, (_req, res, next) => {
  try {
    const dbUrl = env.DATABASE_URL
    const match = dbUrl.match(/postgres(?:ql)?:\/\/([^:]+):[^@]+@([^:]+):(\d+)\/(.+)/)
    if (!match) {
      return res.status(400).json({
        code: 'UNSUPPORTED_DATABASE',
        message: 'Automatic restore is only available for PostgreSQL.'
      })
    }
    const [, user, host, port, dbname] = match

    return res.json({
      status: 'ok',
      message: 'To restore your PostgreSQL database, upload your dump file to the server and run:',
      command: `pg_restore -h ${host} -p ${port} -U ${user} -d ${dbname} --clean --if-exists 9drive-backup.dump`,
      note: 'IMPORTANT: This will overwrite your existing database. Set the PGPASSWORD environment variable before running this command.'
    })
  } catch (error) {
    return next(error)
  }
})
