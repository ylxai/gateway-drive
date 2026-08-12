# 🔍 Audit Report — Gateway Drive (9drive)

**Tanggal**: 2026-08-12
**Cakupan**: Full-stack audit (backend + frontend + infra)
**Status Build**: Backend ✅ (`tsc`) | Frontend ✅ (`tsc && vite build`)
**Status Lint**: Backend ✅ (0 errors, warnings non-null assertion pre-existing) | Frontend ✅ (0 errors, 11 warnings)
**Tindak lanjut**: PR #22 (branch `fix/audit`) — **SUDAH DI-MERGE** ke `main` (`ffeb1d6`, 17 commits, +874/−498) · PR #23 (branch `fix/audit-round2`) — **SUDAH DI-MERGE** ke `main` (`9264b25`); semua sisa item §8 selesai + 5 fix hasil review OCR (commit `1a2aaba`)

---

## 1. Metodologi & Tools

| Alat | Penggunaan |
|---|---|
| **graphify** (skill) | Query knowledge graph: 553 nodes, 1193 edges, 25 komunitas; peta god nodes & modul |
| **open-code-review (ocr) — delegate mode** | `ocr delegate preview` (seleksi file) + `ocr delegate rule` (rule groups per file). Mode penuh tidak jalan karena LLM endpoint belum dikonfigurasi (`ocr llm test` gagal) |
| **Bot review GitHub** | CodeRabbit (7 actionable + outside-diff) & Sourcery (3 suggestion + XSS) — semua temuan diverifikasi manual terhadap kode aktual |
| **Build verification** | `cd backend && npm run build` ✅ · `cd frontend && npm run build` ✅ |
| **Lint** | `npx eslint src` backend → **0 errors** (warnings non-null assertion pre-existing) · frontend → **tidak ada config** |
| **Manual code review** | 20+ file backend, 15+ file frontend, schema Prisma, Docker, nginx, render.yaml |

**Catatan OCR**: CLI `ocr` terpasang di `/root/.nvm/versions/node/v24.19.0/bin/ocr`, namun belum ada LLM endpoint yang dikonfigurasi (perlu `OCR_LLM_URL`/`OCR_LLM_TOKEN`/`OCR_LLM_MODEL` atau `ocr config set llm.*`). Mode delegasi (`ocr delegate preview`/`rule`) tidak butuh LLM dan sudah dijalankan — rule groups default ter-resolve untuk `**/*.{ts,js,tsx,jsx}` (typos, dead code, duplicate code, hardcoding, `var`/`==`/`any`, null checks, React hooks, async handling, security).

---

## 2. Ringkasan Eksekutif

| Severity | Jumlah | Status setelah PR #22 |
|---|---|---|
| 🔴 KRITIS (P0) | 4 | ✅ **4/4 FIXED** |
| 🟧 TINGGI (P1) | 6 | ✅ **6/6 FIXED** |
| 🟨 SEDANG (P2) | 13 | ✅ **13/13 FIXED** |

**Sisa pekerjaan**: ✅ **SEMUA SELESAI di PR #23** (`fix/audit-round2`, merged `9264b25`) — ESLint frontend, rate-limit `trust proxy`, enforcement invites, index kolom `name`, refactor monolith, test suite + CI, dedup quota sync.

---

## 3. 🔴 KRITIS (P0) — Wajib diperbaiki segera

### P0-1. `/system/*` tanpa otorisasi admin — privilege escalation / account takeover
**File**: `backend/src/modules/system/system.routes.ts` (seluruh file)

Semua endpoint hanya memakai `requireAuth` — **tidak ada konsep role admin** di sistem:

- `POST /system/google-config` → user mana pun bisa mengganti **config OAuth Google global** (clientId, clientSecret, **redirectUri**). Attacker set `redirectUri` ke domainnya sendiri → saat user lain klik "Connect Google Drive", kode OAuth korban dikirim ke server attacker → **pencurian token Google Drive (account takeover)**.
- `POST /system/update` → menjalankan `bash update.sh` / `git pull` di server (RCE/DoS oleh user biasa).
- `GET /system/update-log` → membaca file log server.
- `GET /system/backup` + `POST /system/restore` → membocorkan host/user/port DB dan command destruktif (`pg_dump`/`pg_restore`) ke user mana pun.

**Status**: ✅ **FIXED** (PR #22)
- Middleware baru `backend/src/middleware/admin.middleware.ts` (`requireAdmin`) — safe default: `ADMIN_USER_IDS` kosong → semua deny; parsing di-trim/filter.
- Semua endpoint `/system/*` pakai `requireAdmin` kecuali `GET /system/google-config` (dipakai Settings, hanya expose `hasSecret` boolean, tidak bocorkan `clientSecret`).
- `ADMIN_USER_IDS` sudah diisi di `.env.tose` (`a3c66629-…` = irvan nandika).

---

### P0-2. File jadi **publik + writable** di Google Drive tanpa sepengetahuan user
**File**: `backend/src/modules/files/file.routes.ts:369-382` (`GET /:id/view-url`) & `:392-408` (`POST /:id/public-permission`)

```typescript
await drive.permissions.create({ fileId, requestBody: { role: 'writer', type: 'anyone' } })
```

- `view-url` **diam-diam** membuat file publik dan **editable** oleh siapa pun sebagai side-effect. `CODEBASE_ANALYSIS.md` mengklaim bug ini sudah diperbaiki (\"fix/auto-public-permission ✅ Selesai\") — **ternyata masih ada di `view-url`**.
- `public-permission` memberi `role: 'writer'` (bukan `reader`) — siapa pun dengan link bisa mengedit/menghapus konten.

**Status**: ✅ **FIXED** (PR #22)
- `anyone:writer` dihapus dari `view-url`; `public-permission` eksplisit `role: 'reader'`.

---

### P0-3. Upload S3 **pasti gagal** dari UI (frontend)
**File**: `backend/src/modules/uploads/upload.routes.ts:398-413` + `frontend/src/context/UploadContext.tsx`

Frontend **hanya** memakai path resumable (`/uploads/resumable/*`). Untuk akun S3:
1. `POST /uploads/resumable/init` membuat session **tanpa** `googleSessionUri`, balas `{ provider: 's3', offset: 0 }`
2. `PUT /uploads/resumable/chunk/:id` → `if (!session.googleSessionUri || !session.targetConnectedAccountId) return 400 UNSUPPORTED_PROVIDER`
3. Upload error permanen; retry loop dari offset 0 → gagal lagi

> Path multipart `POST /uploads` (busboy) mendukung S3, tapi frontend tidak pernah memakainya.

**Status**: ✅ **FIXED** (PR #22)
- Frontend: jika `initData.provider !== 'google_drive'` → DELETE session resumable yang tidak terpakai + fallback ke multipart streaming (`uploadSingleFileMultipart`).
- Multipart pakai `apiFetch` (token refresh terpusat), simulasi progress 1→95% + snap 100%.
- Backend: `handleUpload` kini mem-parsing field `targetAccountId` (pilihan akun S3 eksplisit user dihormati); `DELETE /uploads/resumable/:id` endpoint baru untuk cleanup orphan session.

---

### P0-4. Download/stream file besar **terpotong di 60 detik**
**File**: `backend/src/modules/files/stream-google-file.ts:57` & `backend/src/modules/files/file.routes.ts:461` (batch-download zip)

```typescript
signal: AbortSignal.timeout(60_000)  // stream-google-file.ts
signal: AbortSignal.timeout(30_000)  // file.routes.ts batch-download
```

`AbortSignal.timeout` membatalkan **seluruh response body**, bukan hanya fase koneksi. File 1GB di koneksi lambat akan ter-abort tepat di detik ke-60/30. Dengan `MAX_UPLOAD_BYTES` 5GB, download besar praktis selalu terputus.

**Status**: ✅ **FIXED** (PR #22)
- `AbortSignal.timeout` dihapus total (stream & zip). Ganti `AbortController` + timer **fase header saja** (30s), dibersihkan setelah headers diterima — body stream tidak terpotong.
- Zip: error handler sebelum `append` + guard `finalized`.

---

## 4. 🟧 TINGGI (P1)

### P1-1. `prisma-types.d.ts` — stub tangan menimpa tipe asli Prisma dengan `any`
**File**: `backend/src/prisma-types.d.ts` (36 error lint)

File ini `declare module "@prisma/client"` dengan `ModelDelegate<any>` → **seluruh type-safety Prisma mati** (semua panggilan DB jadi `any`). Riwayat git menunjukkan \"fix: rm prisma types stub (generated client works)\" tapi file **masih ada** di HEAD. Melanggar AGENTS.md (\"Do not hand-edit generated Prisma client files\").

**Status**: ✅ **FIXED** (PR #22) — file dihapus; `prisma generate` jalan; `tsc` pass.

---

### P1-2. Lint gagal / tidak ada
- **Backend**: `npm run lint` → **53 errors** (`no-explicit-any`, tersebar 14 file) + **129 warnings** (non-null assertions). Distribusi error:
  - `file.routes.ts` (42) · `prisma-types.d.ts` (36) · `upload.routes.ts` (29) · `folder.routes.ts` (22) · `connected-account.routes.ts` (17) · `invite.routes.ts` (10) · `auth.routes.ts` (7) · `storage.routes.ts` (6) · sisanya <5
- **Frontend**: **tidak ada** `eslint.config.*`, tidak ada script lint di `package.json` → `npx eslint` gagal dengan \"couldn't find config\".
- **Tidak ada test** sama sekali di kedua project.

**Status**: ✅ **FIXED** (PR #23)
- ✅ Backend: semua `any` dibersihkan → **0 errors** (warnings non-null assertion pre-existing; diizinkan via `--max-warnings`).
- ✅ **Frontend**: `eslint.config.mjs` (flat config + react-hooks + TS) + script `lint`/`lint:fix` → **0 errors** (11 warnings).
- ✅ **Test**: 14 unit test (`crypto` + `password`) via `node:test` + CI GitHub Actions.

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
- Semua error jadi 500, termasuk 404 cases (\"Shared file not found\" di `public.routes.ts:17`).

**Status**: ✅ **FIXED** (PR #22)
- `ZodError` → 400 · `P2025` (not found) → 404 · `P2002` (unique) → 409 · sisanya 500 generik + log server-side (tidak bocor ke client).

---

### P1-4. File Google Drive **yatim (orphan)** saat upload size mismatch
**File**: `backend/src/modules/uploads/upload.routes.ts:232-238`

Jika `streamedBytes !== meta.sizeBytes`, session ditandai `failed` tapi file yang sudah ter-upload ke Drive **tidak dihapus** → file orphan di folder `9drive` tanpa record DB.

**Status**: ✅ **FIXED** (PR #22)
- Byte mismatch → hapus orphan Google Drive file (`drive.files.delete`).
- S3: orphan object dihapus via `deleteS3Object` (mencegah inflasi quota bucket).

---

### P1-5. Secret default di docker-compose — bahaya jika lupa set env
**File**: `docker-compose.yml:31-32`

```yaml
JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET:-change-this-jwt-secret-at-least-32-chars}
TOKEN_ENCRYPTION_KEY: ${TOKEN_ENCRYPTION_KEY:-change-this-encryption-key-32bytes!}
```

Default ini **publik di repo**. Siapa pun yang deploy tanpa override → JWT bisa dipalsukan, token Google bisa didekripsi (kunci AES-256-GCM diketahui).

**Status**: ✅ **FIXED** (PR #22)
- Default dihapus → `${JWT_ACCESS_SECRET:?}` fail-fast bila kosong (juga `POSTGRES_*`, `DATABASE_URL`, `FRONTEND_URL`, `VITE_API_URL`).
- Catatan: deploy aktual memakai **tose.sh + `.env.tose`** (bukan Docker). `.env.tose` & `frontend/.env` kini **git-ignored**; `frontend/.env.example` dibuat sebagai template. `.env.docker.example` dihapus (beserta referensinya di README/AGENTS).

---

### P1-6. Halaman Starred / Recent / Archived = **mock data**, bukan API
**File**: `frontend/src/pages/StarredPage.tsx`, `RecentPage.tsx`, `ArchivedPage.tsx`

Ketiganya render `files`/`archivedFiles` dari `@/data/drive-data` (data statis) dan angka MetricCard hardcoded (\"3\", \"18\", \"2.6 MB\"). Halaman yang benar-benar terhubung API: All Files, Shared, Trash, Activity, Quota, Settings, Api, Public File, Login/Register.

**Status**: ✅ **FIXED** (PR #22)
- **Recent** → `/files?take=20` nyata, kolom \"Last Opened\" palsu dihapus (label jujur: \"Last Modified\" dari `updatedAt`/`createdAt`).
- **Archived** → `/files/trash` + batch restore/permanent; kolom \"Original Location\" terisi dari `folderId`.
- **Starred** → backend belum punya flag `starred`; halaman render empty state jujur + API call ringan `take=1` sebagai connectivity check (dokumentasi intent, bukan mock data).

---

## 5. 🟨 SEDANG (P2)

| # | Temuan | Lokasi | Status |
|---|---|---|---|
| P2-1 | `FileShare.token` disimpan **plaintext + hash** (redundant; `findSharedFile` OR-search keduanya). INCONSIST-2 dari analisis lama **masih ada** | `backend/prisma/schema.prisma` (FileShare), `backend/src/modules/public/public.routes.ts:13` | ✅ **FIXED** — lookup via `tokenHash`, token disimpan terenkripsi; heuristik `:` aman karena `randomToken()` base64url. |
| P2-2 | Logika callback Google login **diduplikasi** di 2 router (`auth.routes.ts` & `connected-account.routes.ts`) dengan flow login copy-paste — drift risk | kedua file, ~60 baris duplikat | ✅ **FIXED** — `completeGoogleLoginFlow()` satu helper; upsert idempoten; `oauthState.usedAt` dicek sebelum helper (race double-callback aman). Kedua callback kini redirect error flow-aware (`google-auth` vs `google-connected`) — CR #3764493052. |
| P2-3 | Rate limit per-IP: global 100/15m + auth 10/15m — user di belakang NAT bisa ke-lock; backend ter-expose langsung di port 4001 (bypass nginx) dan `trust proxy: true` memungkinkan spoof XFF | `rate-limit.middleware.ts`, `app.ts:27` | ✅ **FIXED** (PR #23) — `trust proxy: 1` (hanya percaya 1 hop, anti spoof XFF) + keyGenerator user-aware (key by user ID bila autentikasi, fallback IP → anti NAT lockout). ⚠️ Asumsi 1 hop proxy di belakang tose.sh — verifikasi saat deploy. |
| P2-4 | Fitur invites **tidak ada enforcement** (murni dekoratif — tidak mengubah akses file) + auto-mark `accepted` tanpa persetujuan invitee | `invite-access.ts`, `invite.routes.ts`, `file.routes.ts`, `folder.routes.ts` | ✅ **FIXED** (PR #23) — helper `resolveFileAccess`/`resolveFolderAccess` (grant eksplisit status `accepted`, role tertinggi menang, file non-active tak bisa diakses invitee), hapus auto-accept, endpoint accept/decline, enforcement di file/folder (edit=editor · move/delete/share-revoke=owner), listing `?shared=1` konsisten dengan folder chain (recursive CTE anti N+1). |
| P2-5 | `createAuditLog` mengirim `JSON.stringify(metadata)` ke kolom `Json` → **double-encoded string**, bukan objek | `backend/src/utils/audit.ts:10` | ✅ **FIXED** — kirim `InputJsonValue` langsung; reader frontend (`ActivityLogPage.renderMetadata`) sudah dual-format (string & object), tidak perlu backfill. |
| P2-6 | Search `contains` + `insensitive` di kolom `name` tanpa index → full scan per user pada library besar | `file.routes.ts:87` | ✅ **FIXED** (PR #23) — `@@index([userId, status, name])` + migration `20260812082901_add_file_name_index` (sudah di-apply ke Neon). |
| P2-7 | `syncGoogleQuota` dipanggil 2x redundant (batch upload + di dalam `syncGoogleAppFolderFiles`) | `upload.routes.ts:257`, `google.service.ts:196` | ✅ **FIXED** (PR #23) — di akhir batch, skip sync akun yang baru di-sync pre-flight (<60s, `upload.routes.ts:310`); tidak ada pemanggilan ganda dalam satu request. |
| P2-8 | `GET /public/files/:token` error → **500** bukan 404 (\"Shared file not found\" di-throw → errorMiddleware) | `public.routes.ts:17` | ✅ **FIXED** — via error middleware P2025 → 404. |
| P2-9 | Tidak ada `helmet` / security headers (X-Content-Type-Options, HSTS, CSP, dll) | `backend/src/app.ts` | ✅ **FIXED** — helmet terpasang; dikonfigurasi agar preview cross-origin (`<img>/<video>/<iframe>`) tidak diblokir CORP/XFO. |
| P2-10 | AGENTS.md **stale**: menyebut MySQL 8+ & `mysql:8.4`, padahal schema/compose/README sudah PostgreSQL 16; `.env.docker.example` dirujuk tapi tidak ada di repo | `AGENTS.md` | ✅ **FIXED** — MySQL → PostgreSQL + service `db`; referensi `.env.docker.example` dihapus; README & AGENTS mencatat deploy tose.sh + `.env.tose`. |
| P2-11 | `AllFilesPage.tsx` (51KB) & `DriveLayout.tsx` (29KB) — monolith; `counter.ts` dead code (sisa template Vite) | frontend | ✅ **FIXED** (PR #23) — `counter.ts` dihapus; refactor: AllFilesPage 881→822, DriveLayout 568→400; ekstrak `drive-utils.ts`, `FolderAppearanceFields.tsx`, `UploadModal.tsx`, `Sidebar.tsx`. |
| P2-12 | `roundRobinCursor` di-increment walau `ordered.length === 0` (modulo 0 → NaN) | `upload.routes.ts:75` | ✅ **FIXED** — mod-0 aman. |
| P2-13 | Zip download: `archive.append(stream)` tanpa await → korupsi parsial jika stream error (BUG-3 lama belum tuntas); juga `batchFileSchema` tidak validasi kepemilikan file per user sebelum stream | `file.routes.ts:447-486` | ✅ **FIXED** — error handler sebelum append + guard `finalized`; `AbortSignal.timeout` header-phase (lihat P0-4). |

---

## 6. Checklist Rule OCR (delegate)

Berikut item dari rule groups default OCR yang relevan & statusnya di codebase ini:

| Rule | Status |
|---|---|
| `var` / `==` / `!=` | ✅ Tidak ditemukan (pakai `let`/`const`, `===`) |
| Nested ternary | ✅ Tidak ditemukan di backend |
| `any` type | ✅ **0 errors** (semua dibersihkan di PR #22; prisma-types.d.ts dihapus) |
| Null checks sebelum akses | ⚠️ Banyak non-null assertion (warnings pre-existing) — aman karena `requireAuth`, tapi rapuh jika middleware berubah |
| Dead code | ✅ `frontend/src/counter.ts` dihapus (PR #22) |
| Hardcoded business strings | ⚠️ MIME-type maps & `typeFilters` hardcoded (wajar); `9d_live_` prefix API key hardcoded |
| React hooks compliance | ⚠️ Belum diaudit penuh (monolith page) |
| Security (authz, injection) | ✅ P0-1, P0-2 fixed; SQL raw `$queryRaw` aman (parameterized) |

---

## 7. ✅ Yang Sudah Baik / Terverifikasi

- **Build kedua project lolos** (`tsc` backend ✅ · `tsc && vite build` frontend ✅).
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
- Env produksi (`.env.tose`) terverifikasi: `DATABASE_URL`/`DIRECT_URL` valid (Neon), `ADMIN_USER_IDS` terisi, Google OAuth config ada di DB (status active, 3 scopes, redirectUri tose.sh), `FRONTEND_URL` Netlify.
- **Keamanan env**: `frontend/.env` di-untrack; `.env.tose` & `.env` root masuk `.gitignore`; folder sisa `gateway-drive/` berisi secret dihapus.

---

## 8. Rekomendasi Prioritas (SISA PEKERJAAN)

**✅ SEMUA SELESAI di PR #23** (`fix/audit-round2`, merged `9264b25`):

1. **ESLint frontend** ✅ — `eslint.config.mjs` (flat config + react-hooks + TS) + script `lint`/`lint:fix`; 0 errors setelah fix `gravatar.ts` & `SettingsPage.tsx` (menutup P1-2).
2. **Index kolom `name`** ✅ — `@@index([userId, status, name])` + migration `20260812082901` di-apply ke Neon (P2-6).
3. **Rate limit & trust proxy** ✅ — `trust proxy: 1` (anti spoof XFF) + keyGenerator user-aware (anti NAT lockout) (P2-3).
4. **Invites enforcement** ✅ — `invite-access.ts` (resolveFileAccess/resolveFolderAccess), hapus auto-accept, endpoint accept/decline, enforcement di file/folder, listing `?shared=1` (P2-4).
5. **Refactor monolith** ✅ — AllFilesPage 881→822, DriveLayout 568→400; ekstrak `drive-utils.ts`, `FolderAppearanceFields`, `UploadModal`, `Sidebar` (P2-11).
6. **Test suite + CI** ✅ — 14 unit test (crypto + password) + `.github/workflows/ci.yml` (build/lint/test kedua project, `permissions` + `concurrency`) (P1-2).
7. **Audit pemanggilan `syncGoogleQuota`** ✅ — guard skip akun yang baru di-sync (<60s) di akhir batch upload (P2-7).

**Bonus dari proses:**
- Test menemukan bug nyata `encryptText('')` tak bisa di-decrypt (GCM empty ciphertext) → fixed di `decryptText`.
- Review OCR (delegate) → 5 isu difix di `1a2aaba`: akses file trash via invite, role gabungan file+folder, share revoke owner-only, CI hardening, error handling accept/decline.
- Review Sourcery → difix di `cf9e829`: recursive CTE anti N+1, keyGenerator short-circuit, JSDoc `requireFileAccess`.

**Non-blocker tersisa:**
- ⚠️ Verifikasi jumlah hop proxy di belakang tose.sh saat deploy (asumsi `trust proxy: 1`).
- 🔲 Backend belum punya flag `starred` — StarredPage render empty state jujur sampai fitur ada.

---

*Dibuat via audit otomatis: graphify + open-code-review (delegate) + bot review GitHub (CodeRabbit/Sourcery, diverifikasi manual) + build/lint verification + manual code review. Di-update setelah PR #22 merged (`ffeb1d6`) dan PR #23 merged (`9264b25`).*
