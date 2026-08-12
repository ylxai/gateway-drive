# Gateway Drive

Storage gateway web app for connecting multiple Google Drive accounts, managing files, and sharing with others — all from one dashboard.

- Connect Google Drive and S3-compatible storage accounts.
- Upload files through the backend, streamed directly to cloud storage.
- Organize files in virtual folders (app-level, not on the provider).
- Preview, download, share, and invite others to files and folders.
- Combined quota tracking and automatic sync from cloud storage.
- Google Workspace export (Docs → PDF, Sheets → XLSX, etc.).
- Batch zip download with streaming and disconnect handling.

## Quick Start (PostgreSQL / Neon)

**Requirements:** Node.js 20+, npm, PostgreSQL 14+ (or [Neon](https://neon.tech)), Google Cloud project with Drive API enabled.

```bash
git clone https://github.com/ylxai/gateway-drive.git
cd gateway-drive
```

### Backend

```bash
cd backend
cp .env.example .env         # edit with your credentials
npm install
npx prisma migrate deploy
npm run dev                   # http://localhost:4000
```

**Key env vars:** `DATABASE_URL` (PostgreSQL), `DIRECT_URL` (Neon), `JWT_ACCESS_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

### Docker

```bash
# Required secrets have NO defaults — set POSTGRES_PASSWORD, JWT_ACCESS_SECRET,
# TOKEN_ENCRYPTION_KEY (and optionally FRONTEND_URL / VITE_API_URL) in .env first.
docker compose up -d --build
```

> The primary deployment for this repo uses [tose.sh](https://tose.sh) with a local `.env.tose` (git-ignored); the `docker-compose.yml` flow is provided as an alternative.

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 8, TypeScript, Tailwind CSS 4, React Router 7 |
| Backend | Express 5, TypeScript, Prisma 6, Zod, JWT, Argon2 |
| Database | PostgreSQL (Neon) |
| Storage | Google Drive API, AWS S3 (S3-compatible) |

## API

| Method | Path | Auth |
|---|---|---|
| `POST` | `/auth/register` | — |
| `POST` | `/auth/login` | — |
| `POST` | `/auth/refresh` | Cookie |
| `GET` | `/auth/me` | Bearer |
| `GET` | `/files` | Bearer |
| `GET` | `/files?folderId=<id>` | Bearer |
| `GET` | `/files?q=<search>` | Bearer |
| `POST` | `/uploads` | Bearer |
| `POST` | `/files/batch-download` | Bearer |
| `POST` | `/folders` | Bearer |
| `DELETE` | `/folders/:id` | Bearer |
| `POST` | `/files/:id/share` | Bearer |
| `POST` | `/files/sync-google` | Bearer |
| `GET` | `/storage/summary` | Bearer |
| `GET` | `/public/files/:token` | — |
| `GET` | `/health` | — |

## Security

- Refresh tokens: httpOnly cookie (`Secure` + `SameSite=Lax`).
- Google tokens: AES-256-GCM encrypted at rest.
- Passwords: Argon2 hashed.
- Rate limiting: Auth 10/15m, Upload 30/15m, General 100/15m.
- CSRF: Origin header validation on mutating endpoints.
- All file uploads are streamed — no disk buffering.
- DB passwords never exposed in API responses.

## License

MIT
