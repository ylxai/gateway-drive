import { Folder, MoreVertical } from 'lucide-react'
import type { MouseEvent } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { FolderItem } from '@/data/drive-data'

export function FolderGrid({ items, mobileTwoColumns = false, onFolderMenu, onFolderOpen }: { items: FolderItem[]; mobileTwoColumns?: boolean; onFolderMenu?: (event: MouseEvent<HTMLElement>, folder: FolderItem) => void; onFolderOpen?: (folder: FolderItem) => void }) {
  return (
    <div className={cn('mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4', mobileTwoColumns && 'grid-cols-2')}>
      {items.map((folder) => (
        <Card key={folder.name} onClick={() => onFolderOpen?.(folder)} onContextMenu={(event) => onFolderMenu?.(event, folder)} className="group relative flex min-h-48 cursor-pointer flex-col items-center justify-center p-6 transition hover:-translate-y-1 hover:shadow-xl">
          <button className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" onClick={(event) => onFolderMenu?.(event, folder)} aria-label={`Open ${folder.name} menu`}><MoreVertical className="h-5 w-5" /></button>
          <Folder className={cn('h-20 w-20 fill-current stroke-current transition group-hover:scale-110', folder.color)} />
          <h2 className="mt-5 text-center text-lg font-extrabold">{folder.name}</h2>
          <p className="mt-1 text-center text-sm text-slate-500">{folder.updated}</p>
        </Card>
      ))}
    </div>
  )
}
