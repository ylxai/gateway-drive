import { Router, type Response, type Request } from 'express'
import { google } from 'googleapis'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { requireAuth, type AuthRequest } from '../../middleware/auth.middleware.js'
import { isAdmin } from '../../middleware/admin.middleware.js'
import { hashPassword, verifyPassword } from '../../utils/password.js'
import { encryptText, hashToken, randomToken } from '../../utils/crypto.js'
import { signAccessToken } from '../../utils/jwt.js'
import { completeGoogleLoginFlow, createOAuthClient } from '../google/google.service.js'

export const authRouter = Router()

const REFRESH_COOKIE = 'gwdrive_refresh'
const REFRESH_COOKIE_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: env.FRONTEND_URL.startsWith('https'),
    sameSite: 'lax',
    maxAge: REFRESH_COOKIE_TTL_MS,
    path: '/auth',
  })
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/auth' })
}

function getRefreshCookie(req: Request) {
  return req.cookies?.[REFRESH_COOKIE] as string | undefined
}

const registerSchema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), captchaToken: z.string().optional() })
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) })
const refreshSchema = z.object({ refreshToken: z.string().min(1) })
const googleExchangeSchema = z.object({ token: z.string().min(1) })

async function createSession(userId: string, req: AuthRequest) {
  const refreshToken = randomToken()
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  const session = await prisma.userSession.create({
    data: {
      userId,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: req.header('User-Agent'),
      ipAddress: req.ip,
      expiresAt,
    },
  })
  return { accessToken: signAccessToken({ sub: userId, sid: session.id }), refreshToken }
}

async function verifyCaptcha(token: string | undefined) {
  if (!env.RECAPTCHA_SECRET_KEY) return true
  if (!token) return false
  const form = new URLSearchParams({ secret: env.RECAPTCHA_SECRET_KEY, response: token })
  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body: form })
  const data = await response.json() as { success?: boolean }
  return Boolean(data.success)
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body)
    if (!(await verifyCaptcha(body.captchaToken))) return res.status(400).json({ code: 'CAPTCHA_FAILED', message: 'Captcha verification failed.' })
    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) return res.status(409).json({ code: 'AUTH_EMAIL_TAKEN', message: 'Email already registered.' })
    const user = await prisma.user.create({ data: { name: body.name, email: body.email, passwordHash: await hashPassword(body.password) } })
    const tokens = await createSession(user.id, req)
    setRefreshCookie(res, tokens.refreshToken)
    return res.status(201).json({ accessToken: tokens.accessToken, user: { id: user.id, name: user.name, email: user.email } })
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) return res.status(401).json({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password.' })
    const tokens = await createSession(user.id, req)
    setRefreshCookie(res, tokens.refreshToken)
    return res.json({ accessToken: tokens.accessToken, user: { id: user.id, name: user.name, email: user.email } })
  } catch (error) {
    return next(error)
  }
})

authRouter.get('/google/url', async (_req, res, next) => {
  try {
    const config = await prisma.providerConfig.findFirstOrThrow({ where: { userId: null, provider: 'google_drive', status: 'active' }, orderBy: { createdAt: 'desc' } })
    const state = randomToken()
    await prisma.oauthState.create({ data: { providerConfigId: config.id, flow: 'login', stateHash: hashToken(state), expiresAt: new Date(Date.now() + 10 * 60_000) } })
    const client = createOAuthClient(config)
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: config.scopes as string[],
      state,
    })
    return res.json({ url })
  } catch (error) {
    return next(error)
  }
})

authRouter.get('/google/callback', async (req, res) => {
  try {
    const query = z.object({ code: z.string(), state: z.string() }).parse(req.query)
    const oauthState = await prisma.oauthState.findUniqueOrThrow({ where: { stateHash: hashToken(query.state) }, include: { providerConfig: true } })
    if (oauthState.flow !== 'login' || oauthState.usedAt || oauthState.expiresAt < new Date()) return res.redirect(`${env.FRONTEND_URL}/google-auth?status=error`)

    const client = createOAuthClient(oauthState.providerConfig!)
    const tokenResult = await client.getToken(query.code)
    const tokens = tokenResult.tokens
    if (!tokens.access_token) return res.redirect(`${env.FRONTEND_URL}/google-auth?status=error`)
    client.setCredentials(tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const profile = await oauth2.userinfo.get()

    const result = await completeGoogleLoginFlow({
      oauthStateId: oauthState.id,
      providerConfigId: oauthState.providerConfigId,
      providerConfigScopes: oauthState.providerConfig!.scopes as string[],
      tokens,
      profile: profile.data,
    })
    return res.redirect(result.redirectUrl)
  } catch (error) {
    console.error('Google Auth callback failed:', error)
    return res.redirect(`${env.FRONTEND_URL}/google-auth?status=error`)
  }
})

authRouter.post('/google/exchange', async (req, res, next) => {
  try {
    const body = googleExchangeSchema.parse(req.body)
    const handoff = await prisma.authHandoff.findFirst({ where: { tokenHash: hashToken(body.token), usedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } })
    if (!handoff) return res.status(401).json({ code: 'AUTH_GOOGLE_HANDOFF_INVALID', message: 'Google login session expired.' })
    await prisma.authHandoff.update({ where: { id: handoff.id }, data: { usedAt: new Date() } })
    const tokens = await createSession(handoff.userId, req)
    setRefreshCookie(res, tokens.refreshToken)
    return res.json({ accessToken: tokens.accessToken, user: { id: handoff.user.id, name: handoff.user.name, email: handoff.user.email } })
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = getRefreshCookie(req)
    if (!refreshToken) return res.status(401).json({ code: 'AUTH_SESSION_EXPIRED', message: 'Refresh token expired.' })
    const tokenHash = hashToken(refreshToken)
    const session = await prisma.userSession.findFirst({ where: { refreshTokenHash: tokenHash, revokedAt: null, expiresAt: { gt: new Date() } } })
    if (!session) return res.status(401).json({ code: 'AUTH_SESSION_EXPIRED', message: 'Refresh token expired.' })

    const tokens = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.userSession.update({
        where: { id: session.id, refreshTokenHash: tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      const refreshToken = randomToken()
      const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
      const newSession = await tx.userSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash: hashToken(refreshToken),
          userAgent: req.header('User-Agent'),
          ipAddress: req.ip,
          expiresAt,
        },
      })
      return { accessToken: signAccessToken({ sub: session.userId, sid: newSession.id }), refreshToken }
    })

    setRefreshCookie(res, tokens.refreshToken)
    return res.json({ accessToken: tokens.accessToken })
  } catch (error) {
    return next(error)
  }
})

authRouter.post('/logout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    await prisma.userSession.update({ where: { id: req.user!.sessionId }, data: { revokedAt: new Date() } })
    clearRefreshCookie(res)
    return res.json({ status: 'ok' })
  } catch (error) {
    return next(error)
  }
})

authRouter.get('/me', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { id: true, name: true, email: true, status: true } })
    return res.json({ user: { ...user, isAdmin: isAdmin(user.id) } })
  } catch (error) {
    return next(error)
  }
})
