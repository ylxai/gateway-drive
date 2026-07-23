# 9Drive — Analisis Codebase Komprehensif

**Tanggal**: 2026-07-23  
**Branch**: `main`  
**Status Build**: Backend ✅ | Frontend ✅  
**Remote**: `https://github.com/ylxai/gateway-drive`  
**Push**: ✅ 22 branch + main

---

## Ringkasan Eksekutif

Ditemukan **6 bug kritis**, **5 masalah performa**, **4 memory leak**, **3 inkonsistensi**, dan **6 celah keamanan**. Masalah paling serius adalah upload yang mem-buffer seluruh file ke RAM (OOM pada file >1GB) dan permission Google Drive `anyone:writer` yang otomatis di-set pada setiap upload.

---

## 1. BUG (Tingkat Kritis)

### 🔴 BUG-1: Upload Memory Leak — Seluruh file di-buffer ke RAM

**File**: `backend/src/modules/uploads/upload.routes.ts` (baris 181-189)  
**Severity**: KRITIS  
**Branch Fix**: `fix/upload-memory-leak`

```typescript
const chunks: Buffer[] = []
fileStream.on('data', (chunk: Buffer) => {
  chunks.push(chunk)
})
await new Promise<void>((resolve, reject) => {
  fileStream.on('end', resolve)
  fileStream.on('error', reject)
})
const fileBuffer = Buffer.concat(chunks)
```

**Akar Masalah**: Handler multipart `handleUpload` mengakumulasi seluruh file ke memori via `Buffer.concat(chunks)`, lalu membacanya ulang sebagai `Readable`. Untuk file 5GB, ini = crash OOM. Busboy sudah menyediakan stream dengan backpressure yang benar. `fileStream` dari busboy seharusnya di-pipe langsung ke Google Drive/S3 tanpa buffering.

**Dampak**: Upload apapun di atas ~1GB akan menghabiskan memori server (~3.8 GiB di mesin ini). Ini menggagalkan tujuan "streaming uploads."

**Perbaikan**: Ganti pendekatan buffering dengan direct piping. Untuk Google, gunakan `drive.files.create({ media: { body: fileStream } })`. Untuk S3, `uploadS3Object(config, key, fileStream, mimeType)` sudah menerima readable stream tapi dipanggil dengan `Readable.from(fileBuffer)` alih-alih `fileStream`.

---

### 🔴 BUG-2: Permission Google Drive `anyone:writer` Otomatis — Data Bocor

**File**: Beberapa lokasi
- `backend/src/modules/uploads/upload.routes.ts` baris 228-239 (upload reguler dan resumable)
- `backend/src/modules/files/file.routes.ts` baris 304-325, 358-369

**Severity**: KRITIS  
**Branch Fix**: `fix/auto-public-permission`

Setiap file yang di-upload ke Google Drive otomatis dibuat publicly writable. Endpoint `view-url` juga diam-diam membuat file publicly writable sebagai side effect. Ini berarti siapa pun dengan file ID bisa menemukan, mengedit, dan mendownload file yang di-upload langsung dari Google Drive.

**Akar Masalah**: `drive.permissions.create({ role: 'writer', type: 'anyone' })` dipanggil sebagai aksi blanket pasca-upload/pasca-view.

**Dampak**: Data bocor. File bisa diakses siapa pun via Google Drive tanpa autentikasi.

**Perbaikan**: Hapus perubahan permission otomatis ini. Buat share link melalui Google Drive API hanya ketika user secara eksplisit klik "Make Public" (endpoint `/public-permission` sudah melakukan ini dengan benar — on demand).

---

### 🔴 BUG-3: Zip Download Google Workspace File — Korupsi Parsial

**File**: `backend/src/modules/files/file.routes.ts` baris 428-439, 400-451  
**Severity**: TINGGI  
**Branch Fix**: `fix/zip-download-corruption`

Ketika batch-download zip mencakup Google Workspace files (Docs, Sheets, dll), URL export digunakan. Jika Google export gagal (misal file terlalu besar), error di-catch di line 443 dan di-log tapi zip archive mungkin korup sebagian karena `archive.append` tidak di-await. Juga `archive.finalize()` di line 447 tidak menunggu append selesai.

**Akar Masalah**: `archive.append(stream, { name })` return langsung tanpa callback/promise. Jika stream error, archive menjadi korup tapi response sudah mulai streaming.

**Dampak**: User mendownload ZIP korup tanpa peringatan error.

**Perbaikan**: Implementasi backpressure-aware append dengan error cleanup. Cek `archive.append` completion sebelum finalize. Gunakan `stream.on('error')` untuk abort seluruh zip.

---

### 🟡 BUG-4: Race Condition di `folderRouter.delete`

**File**: `backend/src/modules/folders/folder.routes.ts` baris 258-312  
**Severity**: SEDANG  
**Branch Fix**: `fix/folder-delete-race-condition`

Saat menghapus folder secara rekursif, file dan item Google Drive dihapus dalam loop (baris 277-301) sebelum database record di-soft-delete. Jika proses crash antara menghapus file di Google Drive dan update database, database akan menunjukkan file sebagai aktif padahal sudah tidak ada di Google Drive.

**Akar Masalah**: Tidak ada transaksi atomik yang membungkus operasi delete file/folder.

**Dampak**: Inkonsistensi state antara database dan Google Drive.

**Perbaikan**: Gunakan Prisma transaction atau implementasi compensating action pattern.

---

### 🟡 BUG-5: Backpressure Tidak Direspek di Stream Google File

**File**: `backend/src/modules/files/stream-google-file.ts` baris 76-79  
**Severity**: SEDANG  
**Branch Fix**: `fix/stream-backpressure`

```typescript
async function pump(): Promise<void> {
  const { done, value } = await reader.read()
  if (done) { res.end(); return }
  res.write(Buffer.from(value))  // Tidak cek return value!
  return pump()
}
```

Fungsi `pump()` memanggil `res.write(Buffer.from(value))` tanpa memperhatikan return value. Jika `res.write` return `false` (backpressure), data akan hilang karena tidak ada `drain` event handler.

**Akar Masalah**: Pump function tidak menghormati Node.js writable stream backpressure.

**Dampak**: Korupsi data pada file besar atau koneksi lambat.

**Perbaikan**: Cek return value `res.write`:
```typescript
if (!res.write(Buffer.from(value))) {
  await new Promise<void>((resolve) => res.once('drain', resolve))
}
```

---

### 🟡 BUG-6: Double-Free Vulnerability pada Token Refresh

**File**: `backend/src/modules/auth/auth.routes.ts` baris 171-179  
**Severity**: SEDANG  
**Branch Fix**: `fix/auth-token-revocation`

Route `/auth/refresh` mengeluarkan access token baru tanpa meng-invalidasi token lama. Karena access token memiliki TTL 15 menit (default), token yang dicuri tetap bisa digunakan hingga 15 menit setelah refresh.

**Akar Masalah**: JWT access token bersifat stateless — tidak ada pengecekan revokasi yang mungkin tanpa token blacklist.

**Dampak**: Token yang dicuri bisa digunakan dalam window TTL.

**Perbaikan**: Persingkat `ACCESS_TOKEN_TTL_SECONDS` (misal 5 menit), atau implementasi Redis-based token blacklist, atau gunakan opaque token dengan DB lookup alih-alih JWT.

---

## 2. MASALAH PERFORMA

### 🟠 PERF-1: N+1 Queries di Google Drive File Sync

**File**: `backend/src/modules/google/google.service.ts` baris 154-173  
**Severity**: TINGGI  
**Branch Fix**: `fix/performance-batch-sync`

Untuk setiap file Google Drive yang ditemukan, kode melakukan `prisma.file.create()` atau `prisma.file.update()` individual. Dengan 1000 file, itu berarti 1000 DB write terpisah.

**Perbaikan**: Batch ke `prisma.file.createMany()` dan akumulasi update. Gunakan `prisma.$transaction()` untuk batch.

---

### 🟠 PERF-2: Tidak Ada Konfigurasi Connection Pooling Prisma

**File**: `backend/src/config/prisma.ts`  
**Severity**: SEDANG  
**Branch Fix**: `fix/performance-prisma-pool`

```typescript
export const prisma = new PrismaClient() // Tanpa konfigurasi pool
```

Default Prisma adalah `connection_limit = num_physical_cpus * 2 + 1`. Di mesin ini kemungkinan 33+ koneksi. Setiap upload stream melibatkan koneksi DB yang bisa menumpuk.

**Perbaikan**: Tambahkan konfigurasi pool eksplisit:
```typescript
new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  connectionLimit: 10
})
```

---

### 🟠 PERF-3: `syncGoogleQuota` Dipanggil Setiap Selesai Upload

**File**: `backend/src/modules/uploads/upload.routes.ts` baris 257  
**Severity**: SEDANG  
**Branch Fix**: `fix/performance-debounce-quota`

Setelah setiap upload selesai, quota di-sync. Jika upload 20 file, itu 20x `drive.about.get()` API call — masing-masing memiliki latency dan biaya Google API quota.

**Perbaikan**: Debounce quota syncs per account. Sync sekali setelah batch selesai, bukan per file.

---

### 🟠 PERF-4: URL.createObjectURL Leak di downloadFile

**File**: `frontend/src/pages/AllFilesPage.tsx` baris 423-435  
**Severity**: RENDAH  
**Branch Fix**: `fix/performance-browser-download`

Pendekatan download mengunduh seluruh file ke Blob sebelum memicu browser download. Untuk file besar (100MB+), ini menahan seluruh file di memori browser.

**Perbaikan**: Gunakan direct `<a>` download link dengan token-based URL, biarkan browser menangani streaming.

---

### 🟠 PERF-5: Duplikasi `loadAll()` Event Listener

**File**: `frontend/src/pages/AllFilesPage.tsx` baris 621-627  
**Severity**: RENDAH  
**Branch Fix**: `fix/performance-dedup-events`

Event `9drive:upload-completed` dan `9drive:storage-changed` keduanya memicu `loadAll()`. Upload progress panel di `DriveLayout` mem-fire `storage-changed`, dan `AllFilesPage` mem-fire `loadAll()` secara independen — menghasilkan dua reload simultan.

**Perbaikan**: Gabung dua event listener menjadi satu handler yang di-debounce.

---

## 3. MEMORY LEAK

### 🔴 LEAK-1: Upload File Buffering (sama dengan BUG-1)

Pola `chunks: Buffer[]` di multipart handler akan OOM proses pada file besar.

---

### 🟡 LEAK-2: `new ZipArchive` Stream Tidak Dibersihkan saat Error

**File**: `backend/src/modules/files/file.routes.ts` baris 412-451  
**Severity**: SEDANG  
**Branch Fix**: `fix/memory-leak-zip-stream`

Jika ada file dalam batch yang gagal di-append, archive stream mungkin hang. Jika client disconnect, stream terus membangun zip. Tidak ada `req.on('close')` handler.

**Perbaikan**: Dengarkan `req.on('close')` dan abort archive build. Juga set timeout untuk zip build.

---

### 🟡 LEAK-3: `writeStream` Tidak Dibersihkan saat Busboy Error di `/restore`

**File**: `backend/src/modules/system/system.routes.ts` baris 228-278  
**Severity**: RENDAH  
**Branch Fix**: `fix/memory-leak-restore-stream`

WriteStream event handlers tidak membersihkan temp file pada busboy error (hanya pada writeStream error). Jika `busboy.on('error')` fire, `writeStream` mungkin leak.

**Perbaikan**: Tambahkan cleanup di semua error path.

---

### 🟡 LEAK-4: Google Auth Client Event Listener Tidak Pernah Dihapus

**File**: `backend/src/modules/google/google.service.ts` baris 13-39  
**Severity**: RENDAH  
**Branch Fix**: `fix/memory-leak-google-client`

`getAuthedGoogleClient` membuat OAuth2 client baru per panggilan. Library `googleapis` melampirkan internal event listener. Untuk upload throughput tinggi, ini bisa terakumulasi.

**Perbaikan**: Cache/reuse OAuth2 clients per connected account dengan token refresh yang sesuai.

---

## 4. INKONSISTENSI

### 🟢 INCONSIST-1: Schema PostgreSQL tapi Kode Backup/Restore Asumsikan SQLite

**File**: 
- `backend/prisma/schema.prisma` baris 6: `provider = "postgresql"`  
- `backend/src/modules/system/system.routes.ts` baris 301: `process.env.DATABASE_URL || 'file:./dev.db'`
- `frontend/src/layouts/DriveLayout.tsx` baris 90: `DB Type: SQLite (Local Database)`

**Severity**: TINGGI  
**Branch Fix**: `fix/inconsistency-db-provider`

Fungsi `getDatabaseFilePath()` di system routes mem-parse `DATABASE_URL` sebagai pola path file — ini hanya bekerja dengan SQLite. Tapi schema adalah PostgreSQL, dan migration menggunakan sintaks PG-specific (`JSONB`, `BIGINT`, `CASCADE`). Ini akan gagal saat runtime jika seseorang menggunakan SQLite.

**Akar Masalah**: Fitur backup/restore di-port dari versi SQLite tapi tidak pernah di-update untuk PostgreSQL.

**Perbaikan**: Hapus endpoint backup/restore (PostgreSQL memiliki `pg_dump`), atau ganti dengan backup PG yang benar.

---

### 🟢 INCONSIST-2: `FileShare.token` Disimpan sebagai Plaintext dan Hash

**File**: `backend/prisma/schema.prisma` baris 237-255  
**Severity**: RENDAH  
**Branch Fix**: `fix/inconsistency-fileshare-token`

Field `token` menyimpan token mentah (digunakan untuk URL construction), sementara `tokenHash` menyimpan hash. Fungsi `findSharedFile` di `public.routes.ts` OR-search keduanya:

```typescript
{ OR: [{ token }, { tokenHash: hashToken(token) }] }
```

Ini berarti jika seseorang memiliki hash, mereka juga bisa menemukan file — atau jika ada hash collision. Juga redundant storage.

**Perbaikan**: Simpan hanya hashed token. Konstruksi public URLs menggunakan derivasi deterministik dari share ID sebagai gantinya.

---

### 🟢 INCONSIST-3: S3 `file.providerFileId` Kadang Object Key, Kadang File ID

**File**: `backend/src/modules/uploads/upload.routes.ts` baris 202-203  
**Severity**: RENDAH  
**Branch Fix**: `fix/inconsistency-s3-key`

Di `upload.routes.ts`:
```typescript
providerFileId = buildS3ObjectKey(config, req.user!.id, provisionalFile.id, fileName)
```

Tapi di `s3.service.ts` `deleteS3Object`, menggunakan `file.providerFileId` langsung sebagai S3 key. Ini hanya bekerja karena keduanya menulis nilai yang sama. Namun, `getS3ConfigForAccount` fetch config lagi — prefix berbeda di config akan merusak delete.

**Perbaikan**: Simpan object keys secara identik. Pertimbangkan menyimpan S3 config version saat write time.

---

## 5. CELAH KEAMANAN

### 🔴 SEC-1: Tidak Ada Rate Limiting

**File**: Seluruh aplikasi  
**Severity**: KRITIS  
**Branch Fix**: `fix/security-rate-limit`

Tidak ada rate limiter di login, register, upload, atau endpoint manapun. Serangan brute-force pada login, registrasi, dan token endpoint tidak termitigasi.

**Perbaikan**: Tambahkan `express-rate-limit` dengan IP-based limiting pada auth routes.

---

### 🔴 SEC-2: Permission Google Drive `anyone:writer` Otomatis (sama dengan BUG-2)

---

### 🟡 SEC-3: Refresh Token Disimpan di localStorage Frontend

**File**: `frontend/src/lib/auth.ts`  
**Severity**: SEDANG  
**Branch Fix**: `fix/security-httponly-cookie`

XSS bisa mencuri refresh token langsung dari `localStorage`. Server-side httpOnly cookies adalah mitigasi standar.

**Perbaikan**: Pindahkan refresh token ke httpOnly cookie. Gunakan `SameSite=Strict` + `Secure`.

---

### 🟡 SEC-4: Tidak Ada CSRF Protection pada Mutation Endpoints

**Severity**: SEDANG  
**Branch Fix**: `fix/security-csrf`

POST/PATCH/DELETE endpoints tidak memiliki CSRF token. Dikombinasikan dengan auth via `Authorization` header (bukan cookie-based), ini agak termitigasi, tapi pendekatan `Authorization` header tidak melindungi dari XSS-initiated requests.

**Perbaikan**: Tambahkan CSRF token untuk mutation endpoints, atau gunakan custom header requirement (`X-Requested-With`).

---

### 🟡 SEC-5: Preview Token Memberikan Full File Access Selama 10 Menit

**File**: `backend/src/modules/files/file.routes.ts` baris 342  
**Severity**: SEDANG  
**Branch Fix**: `fix/security-preview-token`

```typescript
expiresAt: new Date(Date.now() + 10 * 60_000)
```

Token preview yang bocor memberikan full file streaming selama 10 menit. Tidak ada pembatasan scope (view-only vs. download).

**Perbaikan**: Pisahkan preview tokens dari download. Gunakan TTL lebih pendek. Rate-limit token generation.

---

### 🟡 SEC-6: API Key `keyPrefix` 16 Karakter Terlalu Panjang

**File**: `backend/src/modules/api-keys/api-key.routes.ts` baris 39  
**Severity**: RENDAH  
**Branch Fix**: `fix/security-api-key-prefix`

16 karakter pertama dari API key disimpan sebagai `keyPrefix`. Ini secara signifikan mengurangi entropy yang perlu ditebak attacker (mereka hanya perlu menebak ~128 bits alih-alih 256).

**Perbaikan**: Simpan prefix lebih pendek (4-6 karakter) untuk UI display saja, atau derive secara berbeda dari hash.

---

## 6. RINGKASAN AKAR MASALAH

| Kategori | Akar Masalah |
|---|---|
| **Memory/OOM** | Multipart handler buffer seluruh file ke RAM alih-alih streaming |
| **Data leak** | Permission `anyone:writer` otomatis di-set pada setiap upload/view |
| **Rate limiting** | Tidak ada sama sekali — auth, upload, API routes tidak terlindungi |
| **Transaksi** | Folder delete, operasi sync tidak memiliki atomicity |
| **Backpressure** | Google file stream pump mengabaikan writable stream backpressure |
| **N+1 queries** | Individual DB writes dalam loop selama Google sync |
| **SQLite vs PG** | Kode backup/restore mengasumsikan SQLite; schema adalah PostgreSQL |
| **Token storage** | Refresh tokens di localStorage alih-alih httpOnly cookies |
| **Connection pool** | Prisma menggunakan default connection pool tanpa batasan yang dikonfigurasi |

---

## 7. BRANCH PERBAIKAN

| Priority | Branch | Deskripsi | Status |
|---|---|---|---|
| **P0** | `fix/upload-memory-leak` | Stream langsung ke Google/S3, hapus Buffer.concat | ✅ Selesai |
| **P0** | `fix/auto-public-permission` | Hapus `anyone:writer` otomatis | ✅ Branch dibuat |
| **P0** | `fix/security-rate-limit` | Tambahkan rate limiting di semua route | ✅ Branch dibuat |
| **P0** | `fix/inconsistency-db-provider` | Perbaiki backup/restore untuk PostgreSQL | ✅ Branch dibuat |
| **P1** | `fix/performance-batch-sync` | Batch DB writes di Google sync | ✅ Branch dibuat |
| **P1** | `fix/performance-prisma-pool` | Konfigurasi connection pool Prisma | ✅ Branch dibuat |
| **P1** | `fix/stream-backpressure` | Perbaiki backpressure di stream-google-file | ✅ Branch dibuat |
| **P1** | `fix/security-httponly-cookie` | Pindahkan refresh token ke httpOnly cookie | ✅ Branch dibuat |
| **P1** | `fix/performance-debounce-quota` | Debounce quota sync setelah batch upload | ✅ Branch dibuat |
| **P1** | `fix/folder-delete-race-condition` | Gunakan transaksi untuk folder delete | ✅ Branch dibuat |
| **P1** | `fix/memory-leak-zip-stream` | Tambahkan req.on('close') di zip download | ✅ Branch dibuat |
| **P2** | `fix/zip-download-corruption` | Perbaiki korupsi ZIP Google Workspace | ✅ Branch dibuat |
| **P2** | `fix/auth-token-revocation` | Token blacklist/invalidate pada refresh | ✅ Branch dibuat |
| **P2** | `fix/security-preview-token` | Pisahkan scope view/download, perpendek TTL | ✅ Branch dibuat |
| **P2** | `fix/security-api-key-prefix` | Kurangi prefix jadi 6 karakter | ✅ Branch dibuat |
| **P2** | `fix/inconsistency-fileshare-token` | Hapus plaintext token storage | ✅ Branch dibuat |
| **P2** | `fix/performance-browser-download` | Gunakan direct download link alih-alih blob | ✅ Branch dibuat |
| **P2** | `fix/performance-dedup-events` | Gabung event listener storage changed | ✅ Branch dibuat |
| **P2** | `fix/memory-leak-restore-stream` | Cleanup writeStream di busboy error | ✅ Branch dibuat |
| **P2** | `fix/memory-leak-google-client` | Cache OAuth2 client per account | ✅ Branch dibuat |
| **P2** | `fix/security-csrf` | Tambahkan CSRF protection | ✅ Branch dibuat |
| **P2** | `fix/inconsistency-s3-key` | Standarisasi S3 key storage | ✅ Branch dibuat |

---

## 8. REKOMENDASI PRIORITAS

### P0 (Kritis — Segera Diperbaiki)
1. **Fix upload memory buffering** — Stream langsung ke Google/S3. Hapus `Buffer.concat(chunks)`.
2. **Hapus permission `anyone:writer` otomatis** — Hanya set ketika user eksplisit meminta.
3. **Tambahkan rate limiting** — `express-rate-limit` pada auth, upload, API routes.
4. **Perbaiki inkonsistensi database provider** — Hapus backup/restore atau ganti dengan solusi PG-native.

### P1 (Tinggi — Segera Diperbaiki)
5. Tambahkan konfigurasi connection pool ke Prisma client.
6. Perbaiki stream backpressure di `stream-google-file.ts`.
7. Pindahkan refresh token ke httpOnly cookie.
8. Batch DB writes di Google Drive sync.
9. Batch quota syncs — debounce, sync setelah batch selesai.
10. Tambahkan `req.on('close')` handlers ke zip download dan restore streams.
11. Gunakan transaksi untuk folder recursive delete.

### P2 (Sedang — Diperbaiki Jika Memungkinkan)
12. Perbaiki ZIP download korupsi untuk Google Workspace files.
13. Persingkat preview token TTL dan pisahkan view/download scopes.
14. Kurangi API key prefix jadi 6 karakter.
15. Gunakan Blob URL atau direct download link alih-alih full-file fetch di browser.
16. Gabung duplicate event listeners untuk event storage change di frontend.
17. Tambahkan CSRF protection dengan token-based approach untuk mutation endpoints.
18. Cache OAuth2 clients per connected account.
19. Standarisasi S3 key storage.

### P3 (Rendah — Nice to Have)
20. Hapus `FileShare.token` plaintext — gunakan hash-only dengan ID-based URL derivation.
21. Token blacklist untuk access token revocation pada logout.
22. Tambahkan request timeout middleware (misal `express-timeout`).
23. Tambahkan health check depth — verifikasi DB dan Google Drive connectivity di `/health`.
