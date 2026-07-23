export type AuthUser = {
  id: string
  name: string
  email: string
  status?: string
}

const ACCESS_TOKEN_KEY = '9drive.accessToken'
const USER_KEY = '9drive.user'

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) as AuthUser : null
}

export function setAuthSession(accessToken: string, _refreshToken: string, user: AuthUser) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  // refreshToken is now stored in httpOnly cookie — only kept for backward compat
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function updateStoredUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function setAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
}

export function clearAuthSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
