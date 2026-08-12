import { useEffect, useState } from 'react'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FileTable } from '@/components/drive/FileTable'
import { MetricCard } from '@/components/drive/MetricCard'
import { PageHeader } from '@/components/drive/PageHeader'
import { apiFetch, formatBytes, formatDate } from '@/lib/api'
import type { FileItem } from '@/data/drive-data'

type BackendFile = { id: string; name: string; mimeType: string; sizeBytes: string; createdAt: string; deletedAt?: string | null }

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
    date: formatDate(file.deletedAt ?? file.createdAt),
    archivedDate: file.deletedAt ? formatDate(file.deletedAt) : undefined,
    size: formatBytes(file.sizeBytes),
    access: 'Only You',
    kind: mimeToKind(file.mimeType),
    shared: 1,
  }
}

export function ArchivedPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<{ files: BackendFile[] }>('/files/trash')
      .then((data) => { if (active) setFiles(data.files.map(mapFile)) })
      .catch(() => { if (active) setFiles([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function restoreAll() {
    const ids = files.map((file) => file.id).filter(Boolean) as string[]
    if (ids.length === 0) return
    await apiFetch('/files/batch/restore', { method: 'POST', body: JSON.stringify({ fileIds: ids }) })
    setFiles([])
    window.dispatchEvent(new Event('9drive:storage-changed'))
  }

  async function deleteAllPermanently() {
    const ids = files.map((file) => file.id).filter(Boolean) as string[]
    if (ids.length === 0) return
    await apiFetch('/files/batch/permanent', { method: 'DELETE', body: JSON.stringify({ fileIds: ids }) })
    setFiles([])
    window.dispatchEvent(new Event('9drive:storage-changed'))
  }

  return (
    <>
      <PageHeader title="Archived" description="Files removed from the active workspace." actions={<><Button variant="outline" onClick={restoreAll} disabled={files.length === 0}><RotateCcw className="h-4 w-4" />Restore</Button><Button variant="danger" onClick={deleteAllPermanently} disabled={files.length === 0}><Trash2 className="h-4 w-4" />Delete Permanently</Button></>} />
      <Card className="mt-8 border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
        Archived files stay available and do not count as active workspace clutter.
      </Card>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label="Archived Items" value={String(files.length)} icon={Archive} />
        <MetricCard label="Recoverable" value={String(files.length)} icon={RotateCcw} />
        <MetricCard label="Storage Saved" value="—" icon={Trash2} />
      </div>
      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading archived files...</p>
      ) : files.length === 0 ? (
        <Card className="mt-8 p-6 text-center">
          <Archive className="mx-auto h-8 w-8 text-orange-400" />
          <h2 className="mt-3 font-extrabold">Nothing archived</h2>
          <p className="mt-1 text-sm text-slate-500">Deleted files appear here until permanently removed.</p>
        </Card>
      ) : null}
      <FileTable files={files} mode="archived" />
    </>
  )
}
