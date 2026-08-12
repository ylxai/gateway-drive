# 🔍 Audit Report — Gateway Drive (9drive)

**Tanggal**: 2026-08-12
**Cakupan**: Full-stack audit (backend + frontend + infra)
**Status Build**: Backend ✅ (`tsc`) | Frontend ✅ (`tsc && vite build`)
**Status Lint**: Backend ❌ (53 errors, 129 warnings) | Frontend ❌ (no ESLint config)

---

## 1. Metodologi & Tools

| Alat | Penggunaan |
|---|---|
| **graphify** (skill) | Query knowledge graph: 553 nodes, 1193 edges, 25 komunitas; peta god nodes & modul |
| **open-code-review (ocr) — delegate mode** | `ocr delegate preview` (seleksi file) + `ocr delegate rule` (rule groups per file). Mode penuh tidak jalan karena LLM endpoint belum dikonfigurasi (`ocr llm test` gagal) |
| **Build verification** | `cd backend && npm run build` ✅ · `cd frontend && npm run build` ✅ |
| **Lint** | `npx eslint src` backend → 53 errors + 129 warnings · frontend → tidak ada config |
| **Manual code review** | 20+ file backend, 15+ file frontend, schema Prisma, Docker, nginx, render.yaml |

**Catatan OCR**: CLI `ocr` terpasang di `/root/.nvm/versions/node/v24.19.0/bin/ocr`, namun belum ada LLM endpoint yang dikonfigurasi (perlu `OCR_LLM_URL`/`OCR_LLM_TOKEN`/`OCR_LLM_MODEL` atau `ocr config set llm.*`). Mode delegasi (`ocr delegate preview`/`rule`) tidak butuh LLM dan sudah dijalankan — rule groups default ter-resolve untuk `**/*.{ts,js,tsx,jsx}` (typos, dead code, duplicate code, hardcoding, `var`/`==`/`any`, null checks, React hooks, async handling, security).

---

## 2. Ringkasan Eksekutif

| Severity | Jumlah | Kategori |
|---|---|---|
| 🔴 KRITIS (P0) | 4 | Otorisasi `/system/*`, permission Drive `anyone:writer`, upload S3 rusak, stream terpotong 60s |
| 🟧 TINGGI (P1) | 6 | Type stub Prisma, lint gagal/tidak ada, error middleware, orphan file, secret default compose, mock pages |
| 🟨 SEDANG (P2) | 13 | Token share plaintext, duplikasi callback, rate limit, invites dekoratif, dsb. |

---

## 3. 🔴 KRITIS (P0) — Wajib diperbaiki segera

### P0-1. `/system/*` tanpa otorisasi admin — privilege escalation / account takeover
**File**: `backend/src/modules/system/system.routes.ts` (seluruh file)

Semua endpoint hanya memakai `requireAuth` — **tidak ada konsep role admin** di sistem:

- `POST /system/google-config` → user mana pun bisa mengganti **config OAuth Google global** (clientId, clientSecret, **redirectUri**). Attacker set `redirectUri` ke domainnya sendiri → saat user lain klik "Connect Google Drive", kode OAuth korban dikirim ke server attacker → **pencurian token Google Drive (account takeover)**.
- `POST /system/update` → menjalankan `bash update.sh` / `git pull` di server (RCE/DoS oleh user biasa).
- `GET /system/update-log` → membaca file log server.
- `GET /system/backup` + `POST /system/restore` → membocorkan host/user/port DB dan command destruktif (`pg_dump`/`pg_restore`) ke user mana pun.

```typescript
// system.routes.ts
systemRouter.post('/update', requireAuth, (req, res, next) => { ... spawn('bash', ['update.sh']) ... })
systemRouter.post('/google-config', requireAuth, async (req, res, next) => { ... })
```

**Rekomendasi**: tambah kolom `role` di model `User` (+ migration), middleware `requireAdmin`, atau hapus endpoint system dari rute publik. Minimal: batasi ke env whitelist `ADMIN_USER_IDS`.

---

### P0-2. File jadi **publik + writable** di Google Drive tanpa sepengetahuan user
**File**: `backend/src/modules/files/file.routes.ts:369-382` (`GET /:id/view-url`) & `:392-408` (`POST /:id/public-permission`)

```typescript
await drive.permissions.create({ fileId, requestBody: { role: 'writer', type: 'anyone' } })
```

- `view-url` **diam-diam** membuat file publik dan **editable** oleh siapa pun sebagai side-effect. `CODEBASE_ANALYSIS.md` mengklaim bug ini sudah diperbaiki ("fix/auto-public-permission ✅ Selesai") — **ternyata masih ada di `view-url`**.
- `public-permission` memberi `role: 'writer'` (bukan `reader`) — siapa pun dengan link bisa mengedit/menghapus konten.

**Rekomendasi**: hapus permission otomatis di `view-url`; di `public-permission` ganti `role: 'writer'` → `'reader'` kecuali fitur edit memang disengaja secara eksplisit.

---

### P0-3. Upload S3 **pasti gagal** dari UI (frontend)
**File**: `backend/src/modules/uploads/upload.routes.ts:398-413` + `frontend/src/context/UploadContext.tsx`

Frontend **hanya** memakai path resumable (`/uploads/resumable/*`). Untuk akun S3:
1. `POST /uploads/resumable/init` membuat session **tanpa** `googleSessionUri`, balas `{ provider: 's3', offset: 0 }`
2. `PUT /uploads/resumable/chunk/:id` → `if (!session.googleSessionUri || !session.targetConnectedAccountId) return 400 UNSUPPORTED_PROVIDER`
3. Upload error permanen; retry loop dari offset 0 → gagal lagi

> Path multipart `POST /uploads` (busboy) mendukung S3, tapi frontend tidak pernah memakainya.

**Rekomendasi**: endpoint chunk harus handle S3 (stream ke `uploadS3Object`), atau frontend fallback ke multipart untuk akun S3.

---

### P0-4. Download/stream file besar **terpotong di 60 detik**
**File**: `backend/src/modules/files/stream-google-file.ts:57` & `backend/src/modules/files/file.routes.ts:461` (batch-download zip)

```typescript
signal: AbortSignal.timeout(60_000)  // stream-google-file.ts
signal: AbortSignal.timeout(30_000)  // file.routes.ts batch-download
```

`AbortSignal.timeout` membatalkan **seluruh response body**, bukan hanya fase koneksi. File 1GB di koneksi lambat akan ter-abort tepat di detik ke-60/30. Dengan `MAX_UPLOAD_BYTES` 5GB, download besar praktis selalu terputus.

**Rekomendasi**: timeout hanya pada fase resolve header (mis. `Promise.race` di sekitar `fetch`), bukan pada pembacaan stream body; atau hapus signal setelah headers diterima.

---

## 4. 🟧 TINGGI (P1)

### P1-1. `prisma-types.d.ts` — stub tangan menimpa tipe asli Prisma dengan `any`
**File**: `backend/src/prisma-types.d.ts` (36 error lint)

File ini `declare module "@prisma/client"` dengan `ModelDelegate<any>` → **seluruh type-safety Prisma mati** (semua panggilan DB jadi `any`). Riwayat git menunjukkan "fix: rm prisma types stub (generated client works)" tapi file **masih ada** di HEAD. Melanggar AGENTS.md ("Do not hand-edit generated Prisma client files").

**Rekomendasi**: hapus file, jalankan `npx prisma generate`, verifikasi `tsc`.

---

### P1-2. Lint gagal / tidak ada
- **Backend**: `npm run lint` → **53 errors** (`no-explicit-any`, tersebar 14 file) + **129 warnings** (non-null assertions). Distribusi error:
  - `file.routes.ts` (42) · `prisma-types.d.ts` (36) · `upload.routes.ts` (29) · `folder.routes.ts` (22) · `connected-account.routes.ts` (17) · `invite.routes.ts` (10) · `auth.routes.ts` (7) · `storage.routes.ts` (6) · sisanya <5
- **Frontend**: **tidak ada** `eslint.config.*`, tidak ada script lint di `package.json` → `npx eslint` gagal dengan "couldn't find config".
- **Tidak ada test** sama sekali di kedua project.

**Rekomendasi**: bersihkan `any` (atau tambahkan eslint-disable dengan alasan), tambah eslint config frontend, tambah minimal smoke test.

---

### P1-3. Error middleware membocorkan detail internal & salah status code
**File**: `backend/src/middleware/error.middleware.ts`

```typescript
export function errorMiddleware(error: unknown, _req, res, _next) {
  const message = error instanceof Error ? error.message : 'Internal server error'
  return res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message })
}
```

- Error Zod dari `.parse()` (validasi body/query) → **500 dengan pesan ZodError mentah** (seharusnya 400).
- `findFirstOrThrow` → pesan Prisma bocor ke client (info DB internal).
- Semua error jadi 500, termasuk 404 cases ("Shared file not found" di `public.routes.ts:17`).

**Rekomendasi**: handle `ZodError` → 400; `PrismaNotFoundError` → 404; di production kirim pesan generik, log detail di server.

---

### P1-4. File Google Drive **yatim (orphan)** saat upload size mismatch
**File**: `backend/src/modules/uploads/upload.routes.ts:232-238`

Jika `streamedBytes !== meta.sizeBytes`, session ditandai `failed` tapi file yang sudah ter-upload ke Drive **tidak dihapus** → file orphan di folder `9drive` tanpa record DB.

**Rekomendasi**: panggil `drive.files.delete()` pada mismatch; tambah cleanup job untuk upload session gagal.

---

### P1-5. Secret default di docker-compose — bahaya jika lupa set env
**File**: `docker-compose.yml:31-32`

```yaml
JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:-change-this-jwt-secret-at-least-32-chars}
TOKEN_ENCRYPTION_KEY: ${TOKEN_ENCRYPTION_KEY:-change-this-encryption-key-32bytes!}
```

Default ini **publik di repo**. Siapa pun yang deploy tanpa override → JWT bisa dipalsukan, token Google bisa didekripsi (kunci AES-256-GCM diketahui).

**Rekomendasi**: hapus default; fail-fast bila env kosong. Juga `POSTGRES_PASSWORD: postgres` sebaiknya via env.

---

### P1-6. Halaman Starred / Recent / Archived = **mock data**, bukan API
**File**: `frontend/src/pages/StarredPage.tsx`, `RecentPage.tsx`, `ArchivedPage.tsx`

Ketiganya render `files`/`archivedFiles` dari `@/data/drive-data` (data statis) dan angka MetricCard hardcoded ("3", "18", "2.6 MB"). Halaman yang benar-benar terhubung API: All Files, Shared, Trash, Activity, Quota, Settings, Api, Public File, Login/Register.

**Rekomendasi**: wire ketiga halaman ke endpoint yang relevan (`/files?q=...&starred=1`, `/files/recent`, `/files/trash`), atau hapus dari navigasi.

---

## 5. 🟨 SEDANG (P2)

| # | Temuan | Lokasi |
|---|---|---|
| P2-1 | `FileShare.token` disimpan **plaintext + hash** (redundant; `findSharedFile` OR-search keduanya). INCONSIST-2 dari analisis lama **masih ada** | `backend/prisma/schema.prisma` (FileShare), `backend/src/modules/public/public.routes.ts:13` |
| P2-2 | Logika callback Google login **diduplikasi** di 2 router (`auth.routes.ts` & `connected-account.routes.ts`) dengan flow login copy-paste — drift risk | kedua file, ~60 baris duplikat |
| P2-3 | Rate limit per-IP: global 100/15m + auth 10/15m — user di belakang NAT bisa ke-lock; backend ter-expose langsung di port 4001 (bypass nginx) dan `trust proxy: true` memungkinkan spoof XFF | `rate-limit.middleware.ts`, `app.ts:17`, `docker-compose.yml:44` |
| P2-4 | Fitur invites **tidak ada enforcement** (murni dekoratif — tidak mengubah akses file) + auto-mark `accepted` tanpa persetujuan invitee | `invite.routes.ts:57-60` |
| P2-5 | `createAuditLog` mengirim `JSON.stringify(metadata)` ke kolom `Json` → **double-encoded string**, bukan objek | `backend/src/utils/audit.ts:10` |
| P2-6 | Search `contains` + `insensitive` di kolom `name` tanpa index → full scan per user pada library besar | `file.routes.ts:87` (butuh index `@@index([userId, status, name])`) |
| P2-7 | `syncGoogleQuota` dipanggil 2x redundant (batch upload + di dalam `syncGoogleAppFolderFiles`) | `upload.routes.ts:257`, `google.service.ts:196` |
| P2-8 | `GET /public/files/:token` error → **500** bukan 404 ("Shared file not found" di-throw → errorMiddleware) | `public.routes.ts:17` |
| P2-9 | Tidak ada `helmet` / security headers (X-Content-Type-Options, HSTS, CSP, dll) | `backend/src/app.ts` |
| P2-10 | AGENTS.md **stale**: menyebut MySQL 8+ & `mysql:8.4`, padahal schema/compose/README sudah PostgreSQL 16; `.env.docker.example` dirujuk tapi tidak ada di repo | `AGENTS.md` |
| P2-11 | `AllFilesPage.tsx` (51KB) & `DriveLayout.tsx` (29KB) — monolith; `counter.ts` dead code (sisa template Vite) | frontend |
| P2-12 | `roundRobinCursor` di-increment walau `ordered.length === 0` (modulo 0 → NaN) | `upload.routes.ts:75` |
| P2-13 | Zip download: `archive.append(stream)` tanpa await → korupsi parsial jika stream error (BUG-3 lama belum tuntas); juga `batchFileSchema` tidak validasi kepemilikan file per user sebelum stream | `file.routes.ts:447-486` |

---

## 6. Checklist Rule OCR (delegate)

Berikut item dari rule groups default OCR yang relevan & statusnya di codebase ini:

| Rule | Status |
|---|---|
| `var` / `==` / `!=` | ✅ Tidak ditemukan (pakai `let`/`const`, `===`) |
| Nested ternary | ✅ Tidak ditemukan di backend |
| `any` type | ❌ **53 error** — terutama di prisma-types.d.ts, file.routes, upload.routes |
| Null checks sebelum akses | ⚠️ Banyak `req.user!.id` (non-null assertion, 129 warnings) — aman karena `requireAuth`, tapi rapuh jika middleware berubah |
| Dead code | ⚠️ `frontend/src/counter.ts` unreferenced |
| Hardcoded business strings | ⚠️ MIME-type maps & `typeFilters` hardcoded (wajar); `9d_live_` prefix API key hardcoded |
| React hooks compliance | ⚠️ Belum diaudit penuh (monolith page) |
| Security (authz, injection) | ❌ P0-1, P0-2; SQL raw `$queryRaw` aman (parameterized) |

---

## 7. ✅ Yang Sudah Baik / Terverifikasi

- **Build kedua project lolos** setelah `npm install`.
- **Refresh token rotation** benar (revoke + rotate dalam transaksi) — BUG-6 lama sudah fixed.
- Upload streaming tanpa buffering RAM (`Transform` counter) — BUG-1 fixed.
- Backpressure `stream-google-file` sudah handle `drain` — BUG-5 fixed.
- Folder delete pakai transaksi + best-effort Drive cleanup — BUG-4 fixed.
- Prisma pool limit (`connection_limit=10`) — PERF-2 fixed.
- Quota sync di-batch setelah upload — PERF-3 fixed.
- CSRF origin check, rate limiting (3 tier), refresh token di httpOnly cookie.
- API key di-hash; token Google AES-256-GCM at-rest; password Argon2.
- Upload tidak pernah ke disk; CORS dibatasi `FRONTEND_URL`.
- Struktur modul Express rapi (`modules/<feature>/<feature>.routes.ts`), Zod di route, konversi BigInt → string sebelum JSON.

---

## 8. Rekomendasi Prioritas

**Minggu ini (P0):**
1. Otorisasi `/system/*` — tambahkan role admin / `ADMIN_USER_IDS`.
2. Hapus `anyone:writer` otomatis di `view-url`; `public-permission` → `reader`.
3. Perbaiki upload S3 resumable (atau fallback multipart di frontend).
4. Hapus `AbortSignal.timeout` pada fase stream body.

**Minggu depan (P1):**
5. Hapus `prisma-types.d.ts` → `prisma generate` → bersihkan 53 error lint + tambah ESLint frontend.
6. Error middleware: ZodError → 400, not-found → 404, redact pesan internal.
7. Cleanup orphan file pada size mismatch.
8. Hapus secret default di docker-compose.
9. Wire Starred/Recent/Archived ke API nyata.

**Kemudian (P2):**
10. Hash-only untuk share token; dedup callback Google; index kolom `name`; fix audit metadata; tambah `helmet`; update AGENTS.md; tambah test + CI.

---

*Dibuat via audit otomatis: graphify + open-code-review (delegate) + build/lint verification + manual code review.*
