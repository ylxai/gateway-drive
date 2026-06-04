import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, ExternalLink, FileArchive, FileText, ImageIcon, Play, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { API_URL, apiFetch, formatBytes, formatDate } from '@/lib/api'
import { createPlyr, ensurePlyr } from '@/lib/plyr'

type PublicFile = { name: string; mimeType: string; sizeBytes: string; createdAt: string }

function previewKind(mimeType: string) {
  if (mimeType.startsWith('image/') || mimeType === 'application/vnd.google-apps.drawing') return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType === 'application/pdf' || mimeType === 'application/vnd.google-apps.document' || mimeType === 'application/vnd.google-apps.presentation') return 'document'
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'sheet'
  return null
}

function fileIcon(kind: ReturnType<typeof previewKind>) {
  if (kind === 'image') return <ImageIcon className="h-5 w-5" />
  if (kind === 'video') return <Play className="h-5 w-5" />
  if (kind === 'document') return <FileText className="h-5 w-5" />
  if (kind === 'sheet') return <Table2 className="h-5 w-5" />
  return <FileArchive className="h-5 w-5" />
}

function UnsupportedPreview({ file, downloadUrl }: { file: PublicFile; downloadUrl: string }) {
  return (
    <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center text-slate-300">
      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-100 shadow-2xl shadow-black/30">
        <FileArchive className="h-9 w-9" />
      </div>
      <h2 className="mt-6 text-xl font-bold text-white">Preview not available</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{file.name} cannot be previewed in browser. Download file to open it locally.</p>
      <a href={downloadUrl} download className="mt-6">
        <Button><Download className="h-4 w-4" />Download</Button>
      </a>
    </div>
  )
}

export function PublicFilePage({ embed = false }: { embed?: boolean }) {
  const { token } = useParams()
  const [file, setFile] = useState<PublicFile | null>(null)
  const [failed, setFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const previewUrl = `${API_URL}/public/files/${token}/preview`
  const downloadUrl = `${API_URL}/public/files/${token}/download`
  const kind = file ? previewKind(file.mimeType) : null

  useEffect(() => {
    setFailed(false)
    apiFetch<{ file: PublicFile }>(`/public/files/${token}`, { skipAuth: true })
      .then((data) => setFile(data.file))
      .catch(() => {
        setFile(null)
        setFailed(true)
      })
  }, [token])

  useEffect(() => {
    document.title = file ? `${file.name} | 9Drive` : 'Shared file | 9Drive'
    return () => {
      document.title = '9Drive'
    }
  }, [file])

  useEffect(() => {
    if (kind !== 'video' || !videoRef.current) return undefined
    let disposed = false
    let player: { destroy: () => void } | null = null

    ensurePlyr().then(() => {
      if (disposed || !videoRef.current) return
      player = createPlyr(videoRef.current)
    }).catch(() => undefined)

    return () => {
      disposed = true
      player?.destroy()
    }
  }, [kind, previewUrl])

  if (failed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0f1117] p-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/30">
          <FileArchive className="mx-auto h-12 w-12 text-slate-400" />
          <h1 className="mt-5 text-2xl font-extrabold">Shared file not found</h1>
          <p className="mt-2 text-sm text-slate-400">Link may be expired, disabled, or deleted.</p>
        </div>
      </main>
    )
  }

  if (!file) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0f1117] text-sm font-semibold text-slate-400">Loading shared file...</main>
  }

  const preview = (
    <div className="flex h-full w-full items-center justify-center">
      {kind === 'image' ? <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain shadow-2xl shadow-black/30" /> : null}
      {kind === 'video' ? <video ref={videoRef} controls playsInline preload="metadata" className="w-full max-w-6xl rounded-xl bg-black shadow-2xl shadow-black/40"><source src={previewUrl} type={file.mimeType} /></video> : null}
      {kind === 'document' ? <iframe src={previewUrl} title={file.name} className="h-full w-full border-0 bg-white" /> : null}
      {kind === 'sheet' || !kind ? <UnsupportedPreview file={file} downloadUrl={downloadUrl} /> : null}
    </div>
  )

  if (embed) {
    return <main className="h-screen overflow-hidden bg-black text-white">{preview}</main>
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#101218] text-white">
      <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#17191f]/95 px-4 shadow-lg shadow-black/20 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-100">
            {fileIcon(kind)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-white sm:text-base">{file.name}</h1>
            <p className="truncate text-xs text-slate-400">{formatBytes(file.sizeBytes)} • Uploaded {formatDate(file.createdAt)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={`/public/files/${token}/embed`} target="_blank" rel="noreferrer" className="hidden sm:block">
            <Button variant="ghost" className="text-slate-100 hover:bg-white/10"><ExternalLink className="h-4 w-4" />Embed</Button>
          </a>
          <a href={downloadUrl} download>
            <Button variant="outline" className="border-white/10 bg-white/10 text-white hover:bg-white/15"><Download className="h-4 w-4" />Download</Button>
          </a>
        </div>
      </header>

      <section className="flex h-screen items-center justify-center px-3 pb-6 pt-20 sm:px-6">
        <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d12] shadow-2xl shadow-black/40">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.06] to-transparent" />
          {preview}
        </div>
      </section>
    </main>
  )
}
