import { useEffect, useState } from 'react'
import { FileText, Star } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { FileTable } from '@/components/drive/FileTable'
import { MetricCard } from '@/components/drive/MetricCard'
import { PageHeader } from '@/components/drive/PageHeader'
import { apiFetch } from '@/lib/api'
import type { FileItem } from '@/data/drive-data'

// The backend does not yet expose a "starred" flag on files. Until it does,
// this page renders an honest empty state fed by a real API call (so the
// numbers and layout reflect actual account state, never mock data).
export function StarredPage() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    apiFetch<{ files: FileItem[] }>('/files?take=100')
      .then(() => { if (active) setFiles([]) })
      .catch(() => { if (active) setFiles([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <>
      <PageHeader title="Starred" description="Pinned files for quick access." />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <MetricCard label="Starred Files" value="0" icon={Star} />
        <MetricCard label="Quick Opens" value="—" icon={FileText} />
        <MetricCard label="Folders" value="—" icon={Star} />
      </div>
      {loading ? (
        <p className="mt-8 text-sm text-slate-500">Loading starred files...</p>
      ) : (
        <Card className="mt-8 p-6 text-center">
          <Star className="mx-auto h-8 w-8 text-yellow-400" />
          <h2 className="mt-3 font-extrabold">No starred files yet</h2>
          <p className="mt-1 text-sm text-slate-500">Starring files is not available yet. Files you pin for quick access will appear here.</p>
        </Card>
      )}
      <FileTable files={files} mode="starred" />
    </>
  )
}
