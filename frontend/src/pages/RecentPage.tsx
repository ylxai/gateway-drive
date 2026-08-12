import { useEffect, useState } from 'react'
import { Clock, Download, Edit3, Eye } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { FileTable } from '@/components/drive/FileTable'
import { MetricCard } from '@/components/drive/MetricCard'
import { PageHeader } from '@/components/drive/PageHeader'
import { apiFetch, formatBytes, formatDate } from '@/lib/api'
import type { FileItem } from '@/data/drive-data'

type BackendFile = { id: string; name: string; mimeType: string; sizeBytes: string; createdAt: string; folderId?: string | null; connectedAccount?: { email: string; provider: string }; folder?: { id: string; name: string } | null }

function mimeToKind(mimeType: string): FileItem['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf')) return 'pdf'
  return 'doc'
}

function mapFile(file: BackendFile): FileItem {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    createdAt: file.createdAt,
    date: formatDate(file.createdAt),
    size: formatBytes(file.sizeBytes),
    access: file.connectedAccount?.email ?? 'Only You',
    kind: mimeToKind(file.mimeType),
    shared: 1,
    folderId: file.folderId,
    folderName: file.folder?.name,
  }
}

export function RecentPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<{ files: BackendFile[] }>('/files?take=20')
      .then((data) => { if (active) setFiles(data.files.map(mapFile)) })
      .catch(() => { if (active) setFiles([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <>
      <PageHeader title="Recent" description="Latest uploaded files." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label="Recent Files" value={String(files.length)} icon={Eye} />
        <MetricCard label="Latest Upload" value={files[0]?.name ? 'Available' : '—'} icon={Edit3} />
        <MetricCard label="Downloads" value="—" icon={Download} />
      </div>
      <Card className="mt-8 p-5">
        <h2 className="font-extrabold">Activity</h2>
        <div className="mt-4 grid gap-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading recent files...</p>
          ) : files.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              <Clock className="mr-2 inline h-4 w-4" />No files yet. Upload a file to see it here.
            </div>
          ) : (
            files.slice(0, 5).map((file) => (
              <div key={file.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><Eye className="h-4 w-4" /></div>
                <div className="flex-1"><p className="font-semibold">{file.name}</p><p className="text-sm text-slate-500">{file.date}</p></div>
                <Clock className="h-4 w-4 text-slate-400" />
              </div>
            ))
          )}
        </div>
      </Card>
      <FileTable files={files} mode="recent" />
    </>
  )
}
