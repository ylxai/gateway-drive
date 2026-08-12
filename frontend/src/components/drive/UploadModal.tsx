import type { DragEvent, FormEvent } from 'react'
import { Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DummyModal } from '@/components/drive/DummyModal'
import { Input } from '@/components/ui/input'
import { formatBytes } from '@/lib/api'
import type { FolderItem } from '@/data/drive-data'
import type { ConnectedAccount } from '@/lib/drive-utils'

type UploadModalProps = {
  open: boolean
  onClose: () => void
  isUploadDragging: boolean
  selectedFiles: File[]
  loading: boolean
  allFolders: FolderItem[]
  connectedAccounts: ConnectedAccount[]
  activeFolderName: string | null
  selectedFolderId: string
  selectedTargetAccountId: string
  onSelectFiles: (files: FileList | File[] | null | undefined) => void
  onRemoveFile: (index: number) => void
  onDrag: (event: DragEvent<HTMLLabelElement>) => void
  onFolderIdChange: (folderId: string) => void
  onTargetAccountChange: (accountId: string) => void
  onSubmit: (event: FormEvent) => void
}

export function UploadModal({ open, onClose, isUploadDragging, selectedFiles, loading, allFolders, connectedAccounts, activeFolderName, selectedFolderId, selectedTargetAccountId, onSelectFiles, onRemoveFile, onDrag, onFolderIdChange, onTargetAccountChange, onSubmit }: UploadModalProps) {
  return (
    <DummyModal open={open} title="Upload File" description="Stream file directly to selected Google Drive account." onClose={onClose}>
      <form onSubmit={onSubmit} className="grid gap-4">
        <label onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrag} className={isUploadDragging ? 'grid cursor-pointer gap-3 rounded-2xl border-2 border-dashed border-blue-500 bg-blue-50 p-4 text-center transition sm:p-6' : 'grid cursor-pointer gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-center transition hover:border-blue-300 hover:bg-blue-50/50 sm:p-6'}>
          <Upload className={isUploadDragging ? 'mx-auto h-8 w-8 text-blue-600' : 'mx-auto h-8 w-8 text-slate-500'} />
          <span className="text-sm font-extrabold text-slate-950">Drop file here or click to browse</span>
          <span className="text-xs text-slate-500">Metadata is sent before the file so upload can stream directly to Google Drive.</span>
          <Input type="file" className="sr-only" multiple onChange={(event) => onSelectFiles(event.target.files)} required={selectedFiles.length === 0} />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Target Storage Account
          <select
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white"
            value={selectedTargetAccountId}
            onChange={(event) => onTargetAccountChange(event.target.value)}
          >
            <option value="">Automatic (Default)</option>
            {connectedAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email || account.displayName || account.id} ({account.provider === 's3' ? 'S3' : 'Google Drive'})
              </option>
            ))}
          </select>
        </label>
        {activeFolderName ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Uploading to: <b>{activeFolderName}</b></p> : <label className="grid gap-2 text-sm font-semibold">Virtual Folder<select className="h-11 rounded-xl border border-slate-200 px-3 text-sm bg-white" value={selectedFolderId} onChange={(event) => onFolderIdChange(event.target.value)}><option value="">No folder</option>{allFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
        {selectedFiles.length > 0 ? <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><div className="flex items-center justify-between gap-3"><span className="font-bold text-slate-950">{selectedFiles.length} selected</span><span className="shrink-0">{formatBytes(selectedFiles.reduce((total, file) => total + file.size, 0))}</span></div>{selectedFiles.map((file, index) => <div key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"><span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span><span className="shrink-0 text-xs text-slate-500">{formatBytes(file.size)}</span><button type="button" className="shrink-0 text-slate-500 hover:text-red-600" onClick={() => onRemoveFile(index)} aria-label={`Remove ${file.name}`}><X className="h-4 w-4" /></button></div>)}</div> : null}
        <div className="grid gap-3 sm:flex sm:justify-end"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={loading || selectedFiles.length === 0}>{loading ? 'Uploading...' : `Upload${selectedFiles.length > 1 ? ` ${selectedFiles.length} files` : ''}`}</Button></div>
      </form>
    </DummyModal>
  )
}
