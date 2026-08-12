// Minimal env vars so unit tests can import modules that read `env`
// (crypto.ts reads TOKEN_ENCRYPTION_KEY at module scope).
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test'
process.env.DIRECT_URL ||= process.env.DATABASE_URL
process.env.FRONTEND_URL ||= 'http://localhost:5173'
process.env.JWT_ACCESS_SECRET ||= 'j'.repeat(64)
process.env.TOKEN_ENCRYPTION_KEY ||= 't'.repeat(64)
