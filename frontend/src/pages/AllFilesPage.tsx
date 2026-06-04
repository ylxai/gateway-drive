import { useEffect, useState, type FormEvent, type MouseEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Archive, CheckCircle, ChevronDown, Folder, FolderPlus, LayoutGrid, List, MoreVertical, Star, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DummyModal } from '@/components/drive/DummyModal'
import { EmptyAreaContextMenu } from '@/components/drive/EmptyAreaContextMenu'
import { FileContextMenu } from '@/components/drive/FileContextMenu'
import { FileDetailsDrawer } from '@/components/drive/FileDetailsDrawer'
import { FileTable } from '@/components/drive/FileTable'
import { FolderContextMenu } from '@/components/drive/FolderContextMenu'
import { FolderGrid } from '@/components/drive/FolderGrid'
import { PageHeader } from '@/components/drive/PageHeader'
import { Input } from '@/components/ui/input'
import { API_URL, apiFetch, formatBytes, formatDate } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'
import type { FileItem, FolderItem } from '@/data/drive-data'

type BackendFile = { id: string; name: string; mimeType: string; sizeBytes: string; createdAt: string; folderId?: string | null; connectedAccount?: { email: string; provider: string }; folder?: { id: string; name: string } | null }
type BackendFolder = { id: string; name: string; color: string; parentId?: string | null; updatedAt: string }

const folderColors = ['text-blue-500', 'text-lime-500', 'text-cyan-400', 'text-yellow-400', 'text-orange-500']

function mimeToKind(mimeType: string): FileItem['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf')) return 'pdf'
  return 'doc'
}

function mapFile(file: BackendFile): FileItem {
  return { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: file.createdAt, accountEmail: file.connectedAccount?.email, accountProvider: file.connectedAccount?.provider, date: formatDate(file.createdAt), size: formatBytes(file.sizeBytes), access: file.connectedAccount?.email ?? 'Google Drive', kind: mimeToKind(file.mimeType), shared: 1, folderId: file.folderId, folderName: file.folder?.name }
}

function mapFolder(folder: BackendFolder): FolderItem {
  return { id: folder.id, name: folder.name, color: folder.color, updated: `Updated ${formatDate(folder.updatedAt)}` }
}

export function AllFilesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeFolderId = searchParams.get('folderId')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [folderRenameOpen, setFolderRenameOpen] = useState(false)
  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')
  const [copiedShareLink, setCopiedShareLink] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [allFolders, setAllFolders] = useState<FolderItem[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [folderName, setFolderName] = useState('')
  const [folderColor, setFolderColor] = useState('text-blue-500')
  const [renameValue, setRenameValue] = useState('')
  const [folderRenameValue, setFolderRenameValue] = useState('')
  const [folderRenameColor, setFolderRenameColor] = useState('text-blue-500')
  const [activeFile, setActiveFile] = useState<FileItem | null>(null)
  const [activeFolderForMenu, setActiveFolderForMenu] = useState<FolderItem | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem | null }>({ x: 0, y: 0, file: null })
  const [folderContextMenu, setFolderContextMenu] = useState<{ x: number; y: number; folder: FolderItem | null }>({ x: 0, y: 0, folder: null })
  const [emptyContextMenu, setEmptyContextMenu] = useState<{ x: number; y: number; open: boolean }>({ x: 0, y: 0, open: false })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ open: boolean; fileName: string; percent: number; status: 'uploading' | 'done' | 'error' }>({ open: false, fileName: '', percent: 0, status: 'uploading' })

  async function loadFiles() {
    const path = activeFolderId ? `/files?folderId=${activeFolderId}` : '/files'
    const data = await apiFetch<{ files: BackendFile[] }>(path)
    setFiles(data.files.map(mapFile))
  }

  async function loadFolders() {
    const visiblePath = activeFolderId ? `/folders?parentId=${activeFolderId}` : '/folders'
    const [visibleData, allData] = await Promise.all([
      apiFetch<{ folders: BackendFolder[] }>(visiblePath),
      apiFetch<{ folders: BackendFolder[] }>('/folders?all=1'),
    ])
    setFolders(visibleData.folders.map(mapFolder))
    setAllFolders(allData.folders.map(mapFolder))
  }

  async function loadAll() {
    await Promise.all([loadFiles(), loadFolders()])
  }

  useEffect(() => {
    loadAll().catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load files'))
  }, [activeFolderId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setContextMenu({ x: 0, y: 0, file: null })
      if (event.key === 'Escape') setFolderContextMenu({ x: 0, y: 0, folder: null })
      if (event.key === 'Escape') setEmptyContextMenu({ x: 0, y: 0, open: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function createFolder(event: FormEvent) {
    event.preventDefault()
    await apiFetch('/folders', { method: 'POST', body: JSON.stringify({ name: folderName, color: folderColor, parentId: activeFolderId ?? null }) })
    setFolderName('')
    setFolderColor('text-blue-500')
    setFolderOpen(false)
    await loadFolders()
  }

  async function uploadFile(event: FormEvent) {
    event.preventDefault()
    if (!selectedFile) return
    setLoading(true)
    setMessage('')
    try {
      const form = new FormData()
      form.append('sizeBytes', String(selectedFile.size))
      form.append('fileName', selectedFile.name)
      form.append('mimeType', selectedFile.type || 'application/octet-stream')
      const targetFolderId = activeFolderId || selectedFolderId
      if (targetFolderId) form.append('folderId', targetFolderId)
      form.append('file', selectedFile)
      setUploadProgress({ open: true, fileName: selectedFile.name, percent: 0, status: 'uploading' })
      await uploadWithProgress(form, (percent) => setUploadProgress((current) => ({ ...current, percent })))
      setUploadProgress((current) => ({ ...current, percent: 100, status: 'done' }))
      setSelectedFile(null)
      setSelectedFolderId('')
      setUploadOpen(false)
      setMessage('File uploaded to Google Drive.')
      await loadFiles()
      window.dispatchEvent(new Event('9drive:storage-changed'))
    } catch (error) {
      setUploadProgress((current) => ({ ...current, status: 'error' }))
      setMessage(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  function uploadWithProgress(form: FormData, onProgress: (percent: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open('POST', `${API_URL}/uploads`)
      const token = getAccessToken()
      if (token) request.setRequestHeader('Authorization', `Bearer ${token}`)
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)))
      }
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) resolve()
        else {
          const error = JSON.parse(request.responseText || '{}') as { message?: string }
          reject(new Error(error.message ?? 'Upload failed'))
        }
      }
      request.onerror = () => reject(new Error('Upload failed'))
      request.send(form)
    })
  }

  function openContext(event: MouseEvent<HTMLElement>, file: FileItem) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFile(file)
    setContextMenu({ x: event.clientX, y: event.clientY, file })
  }

  function openFolderMenu(event: MouseEvent<HTMLElement>, folder: FolderItem) {
    event.preventDefault()
    event.stopPropagation()
    setActiveFolderForMenu(folder)
    setFolderContextMenu({ x: event.clientX, y: event.clientY, folder })
  }

  function openFolder(folder: FolderItem) {
    if (!folder.id) return
    setSearchParams({ folderId: folder.id })
  }

  function openEmptyContextMenu(event: MouseEvent<HTMLElement>) {
    event.preventDefault()
    setEmptyContextMenu({ x: event.clientX, y: event.clientY, open: true })
  }

  function closeFolder() {
    setSearchParams({})
  }

  async function viewFile() {
    if (!activeFile?.id) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    const data = await apiFetch<{ url: string }>(`/files/${activeFile.id}/preview-token`, { method: 'POST' })
    setPreviewUrl(data.url)
    setPreviewOpen(true)
    setContextMenu({ x: 0, y: 0, file: null })
  }

  async function downloadFile() {
    if (!activeFile?.id) return
    const response = await fetch(`${API_URL}/files/${activeFile.id}/download`, { headers: { Authorization: `Bearer ${getAccessToken()}` } })
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = activeFile.name
    link.click()
    URL.revokeObjectURL(url)
    setContextMenu({ x: 0, y: 0, file: null })
  }

  async function renameFile(event: FormEvent) {
    event.preventDefault()
    if (!activeFile?.id) return
    await apiFetch(`/files/${activeFile.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameValue }) })
    setRenameOpen(false)
    await loadFiles()
  }

  async function moveFile(event: FormEvent) {
    event.preventDefault()
    if (!activeFile?.id) return
    await apiFetch(`/files/${activeFile.id}`, { method: 'PATCH', body: JSON.stringify({ folderId: selectedFolderId || null }) })
    setMoveOpen(false)
    setSelectedFolderId('')
    await loadFiles()
  }

  async function deleteFile() {
    if (!activeFile?.id) return
    await apiFetch(`/files/${activeFile.id}`, { method: 'DELETE' })
    setDeleteOpen(false)
    await loadFiles()
    window.dispatchEvent(new Event('9drive:storage-changed'))
  }

  async function shareFile() {
    if (!activeFile?.id) return
    const data = await apiFetch<{ url: string }>(`/files/${activeFile.id}/share`, { method: 'POST' })
    setShareUrl(data.url)
    setCopiedShareLink(false)
    setShareOpen(true)
    setContextMenu({ x: 0, y: 0, file: null })
  }

  async function copyShareLink() {
    await navigator.clipboard.writeText(shareUrl)
    setCopiedShareLink(true)
    window.setTimeout(() => setCopiedShareLink(false), 1600)
  }

  async function renameFolder(event: FormEvent) {
    event.preventDefault()
    if (!activeFolderForMenu?.id) return
    await apiFetch(`/folders/${activeFolderForMenu.id}`, { method: 'PATCH', body: JSON.stringify({ name: folderRenameValue, color: folderRenameColor }) })
    setFolderRenameOpen(false)
    await loadFolders()
  }

  async function deleteFolder() {
    if (!activeFolderForMenu?.id) return
    await apiFetch(`/folders/${activeFolderForMenu.id}`, { method: 'DELETE' })
    setFolderDeleteOpen(false)
    await loadFolders()
  }

  function closePreview() {
    setPreviewUrl('')
    setPreviewOpen(false)
  }

  const recentFolders = folders.slice(0, 4)
  const moreFolders = folders.slice(4)
  const activeFolder = allFolders.find((folder) => folder.id === activeFolderId)

  return (
    <>
      <div onContextMenu={openEmptyContextMenu} className="min-h-[620px]">
      <PageHeader title={activeFolder ? <span><button className="text-blue-600 hover:underline" onClick={closeFolder}>All Files</button><span className="text-slate-400"> / </span><span>{activeFolder.name}</span></span> : 'All Files'} actions={<><Button variant="outline" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" />Upload</Button><Button variant="outline" onClick={() => setFolderOpen(true)}><FolderPlus className="h-4 w-4" />New Folder</Button></>} />
      {message ? <p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">{message}</p> : null}
      {!activeFolder && (recentFolders.length > 0 ? <FolderGrid items={recentFolders} mobileTwoColumns onFolderMenu={openFolderMenu} onFolderOpen={openFolder} /> : <p className="mt-8 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">No folders yet. Click New Folder to organize uploads.</p>)}
      {!activeFolder && moreFolders.length > 0 ? <Card className="mt-5 p-5"><h2 className="font-extrabold">More Folders</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{moreFolders.map((folder) => <div key={folder.id} onClick={() => openFolder(folder)} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 hover:bg-slate-100"><div className="flex items-center gap-3"><Folder className="h-5 w-5 text-blue-600" /><div><p className="font-semibold">{folder.name}</p><p className="text-xs text-slate-500">{folder.updated}</p></div></div><button className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white" onClick={(event) => openFolderMenu(event, folder)} aria-label={`Open ${folder.name} menu`}><MoreVertical className="h-5 w-5" /></button></div>)}</div></Card> : null}
      <div className="mt-10 flex items-center justify-between gap-3">
        <div className="flex gap-3"><Button variant="soft"><Archive className="h-4 w-4" />Recents</Button><Button variant="soft"><Star className="h-4 w-4" />Starred</Button></div>
        <div className="hidden gap-3 sm:flex"><Button variant="outline" size="icon"><LayoutGrid className="h-5 w-5" /></Button><Button variant="outline" size="icon"><List className="h-5 w-5" /></Button></div>
      </div>
      {files.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-500">{activeFolder ? 'No files in this folder yet.' : 'No uploaded files yet. Connect Google Drive in Settings, then upload a file.'}</p> : <FileTable files={files} onFileContextMenu={openContext} />}
      </div>
      <EmptyAreaContextMenu x={emptyContextMenu.x} y={emptyContextMenu.y} open={emptyContextMenu.open} onClose={() => setEmptyContextMenu({ x: 0, y: 0, open: false })} onUpload={() => { setUploadOpen(true); setEmptyContextMenu({ x: 0, y: 0, open: false }) }} onCreateFolder={() => { setFolderOpen(true); setEmptyContextMenu({ x: 0, y: 0, open: false }) }} />
      <FileContextMenu x={contextMenu.x} y={contextMenu.y} file={contextMenu.file} onClose={() => setContextMenu({ x: 0, y: 0, file: null })} onView={viewFile} onDownload={downloadFile} onRename={() => { setRenameValue(activeFile?.name ?? ''); setRenameOpen(true); setContextMenu({ x: 0, y: 0, file: null }) }} onMove={() => { setMoveOpen(true); setContextMenu({ x: 0, y: 0, file: null }) }} onDetails={() => { setDetailOpen(true); setContextMenu({ x: 0, y: 0, file: null }) }} onShare={shareFile} onDelete={() => { setDeleteOpen(true); setContextMenu({ x: 0, y: 0, file: null }) }} />
      <FolderContextMenu x={folderContextMenu.x} y={folderContextMenu.y} folder={folderContextMenu.folder} onClose={() => setFolderContextMenu({ x: 0, y: 0, folder: null })} onRename={() => { setFolderRenameValue(activeFolderForMenu?.name ?? ''); setFolderRenameColor(activeFolderForMenu?.color ?? 'text-blue-500'); setFolderRenameOpen(true); setFolderContextMenu({ x: 0, y: 0, folder: null }) }} onDelete={() => { setFolderDeleteOpen(true); setFolderContextMenu({ x: 0, y: 0, folder: null }) }} />
      <FileDetailsDrawer open={detailOpen} file={activeFile} onClose={() => setDetailOpen(false)} />

      <DummyModal open={uploadOpen} title="Upload File" description="Stream file directly to selected Google Drive account." onClose={() => setUploadOpen(false)}>
        <form onSubmit={uploadFile} className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">Choose File<Input type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} required /></label>
          {activeFolder ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Uploading to: <b>{activeFolder.name}</b></p> : <label className="grid gap-2 text-sm font-semibold">Virtual Folder<select className="h-11 rounded-xl border border-slate-200 px-3 text-sm" value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)}><option value="">No folder</option>{allFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
          {selectedFile ? <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{selectedFile.name} - {formatBytes(selectedFile.size)}</p> : null}
          <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button><Button disabled={loading || !selectedFile}>{loading ? 'Uploading...' : 'Upload'}</Button></div>
        </form>
      </DummyModal>
      <DummyModal open={folderOpen} title="New Folder" description="Create a virtual folder for organizing files." onClose={() => setFolderOpen(false)}>
        <form onSubmit={createFolder} className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold">Folder Name<Input value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Project Assets" required /></label>
          <div className="grid gap-2 text-sm font-semibold"><span>Folder Color</span><div className="flex flex-wrap gap-2">{folderColors.map((color) => <button key={color} type="button" onClick={() => setFolderColor(color)} className={folderColor === color ? 'h-8 w-8 rounded-lg border-2 border-blue-600 bg-slate-50' : 'h-8 w-8 rounded-lg border border-slate-200 bg-slate-50'}><Folder className={`mx-auto h-5 w-5 fill-current ${color}`} /></button>)}</div></div>
          <div className="flex justify-end gap-3 pt-2"><Button type="button" variant="outline" onClick={() => setFolderOpen(false)}>Cancel</Button><Button>Create Folder</Button></div>
        </form>
      </DummyModal>
      <DummyModal open={renameOpen} title="Rename File" description={activeFile?.name ?? ''} onClose={() => setRenameOpen(false)}><form onSubmit={renameFile} className="grid gap-4"><Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} required /><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button><Button>Rename</Button></div></form></DummyModal>
      <DummyModal open={moveOpen} title="Move to Folder" description={activeFile?.name ?? ''} onClose={() => setMoveOpen(false)}><form onSubmit={moveFile} className="grid gap-4"><select className="h-11 rounded-xl border border-slate-200 px-3 text-sm" value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)}><option value="">No folder</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button><Button>Move</Button></div></form></DummyModal>
      <DummyModal open={deleteOpen} title="Delete File" description={`Delete ${activeFile?.name ?? 'file'} from Google Drive?`} onClose={() => setDeleteOpen(false)}><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={deleteFile}>Delete</Button></div></DummyModal>
      <DummyModal open={shareOpen} title="Share Link" description={activeFile?.name ?? ''} onClose={() => setShareOpen(false)}><div className="grid gap-4"><Input value={shareUrl} readOnly /><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setShareOpen(false)}>Close</Button><Button onClick={copyShareLink}>{copiedShareLink ? <CheckCircle className="h-4 w-4" /> : null}{copiedShareLink ? 'Copied!' : 'Copy Link'}</Button></div>{copiedShareLink ? <p className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">Share link copied to clipboard.</p> : null}</div></DummyModal>
      <DummyModal open={folderRenameOpen} title="Rename Folder" description={activeFolderForMenu?.name ?? ''} onClose={() => setFolderRenameOpen(false)}><form onSubmit={renameFolder} className="grid gap-4"><Input value={folderRenameValue} onChange={(event) => setFolderRenameValue(event.target.value)} required /><div className="grid gap-2 text-sm font-semibold"><span>Folder Color</span><div className="flex flex-wrap gap-2">{folderColors.map((color) => <button key={color} type="button" onClick={() => setFolderRenameColor(color)} className={folderRenameColor === color ? 'h-8 w-8 rounded-lg border-2 border-blue-600 bg-slate-50' : 'h-8 w-8 rounded-lg border border-slate-200 bg-slate-50'}><Folder className={`mx-auto h-5 w-5 fill-current ${color}`} /></button>)}</div></div><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setFolderRenameOpen(false)}>Cancel</Button><Button>Rename</Button></div></form></DummyModal>
      <DummyModal open={folderDeleteOpen} title="Delete Folder" description={`Delete virtual folder ${activeFolderForMenu?.name ?? ''}? Files inside will remain uploaded.`} onClose={() => setFolderDeleteOpen(false)}><div className="flex justify-end gap-3"><Button variant="outline" onClick={() => setFolderDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={deleteFolder}>Delete</Button></div></DummyModal>
      <DummyModal open={previewOpen} title="File Preview" description={activeFile?.name ?? ''} onClose={closePreview} className="max-w-5xl">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {activeFile?.mimeType?.startsWith('image/') ? <img src={previewUrl} alt={activeFile.name} className="max-h-[70vh] w-full object-contain" /> : null}
          {activeFile?.mimeType?.startsWith('video/') ? <video src={previewUrl} controls className="max-h-[70vh] w-full" /> : null}
          {activeFile?.mimeType === 'application/pdf' ? <iframe src={previewUrl} title={activeFile.name} className="h-[70vh] w-full" /> : null}
          {!activeFile?.mimeType?.startsWith('image/') && !activeFile?.mimeType?.startsWith('video/') && activeFile?.mimeType !== 'application/pdf' ? <div className="p-6 text-center text-sm text-slate-500">Preview not available for this file type. Use Download instead.</div> : null}
        </div>
      </DummyModal>
      {uploadProgress.open ? (
        <div className="fixed bottom-5 right-5 z-[70] w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 font-extrabold">
              {uploadProgress.status === 'done' ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : <Upload className="h-5 w-5 text-blue-600" />}
              {uploadProgress.status === 'done' ? 'Upload complete' : uploadProgress.status === 'error' ? 'Upload failed' : 'Uploading file'}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUploadProgress((current) => ({ ...current, open: false }))}><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="truncate font-semibold">{uploadProgress.fileName}</p>
              <span className="text-slate-500">{uploadProgress.percent}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className={uploadProgress.status === 'error' ? 'h-full rounded-full bg-red-500' : 'h-full rounded-full bg-blue-600'} style={{ width: `${uploadProgress.percent}%` }} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
