import type { FileItem, FolderItem } from '@/data/drive-data'
import { formatBytes, formatDate } from '@/lib/api'
import type { FolderSizeScale } from '@/components/drive/FolderGrid'

export type BackendFile = { id: string; name: string; mimeType: string; sizeBytes: string; createdAt: string; folderId?: string | null; connectedAccount?: { email: string; provider: string }; folder?: { id: string; name: string } | null }
export type BackendFolder = { id: string; name: string; color: string; iconUrl?: string | null; parentId?: string | null; providerFolderId?: string | null; updatedAt: string }
export type ConnectedAccount = { id: string; provider: string; email: string; displayName?: string | null; status: string }

export type FileViewMode = 'list' | 'grid'

export const fileViewStorageKey = '9drive:all-files-view-mode'

export function getStoredFileViewMode(): FileViewMode {
  const stored = localStorage.getItem(fileViewStorageKey)
  return stored === 'grid' || stored === 'list' ? stored : 'list'
}

export function mimeToKind(mimeType: string): FileItem['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf')) return 'pdf'
  return 'doc'
}

export function providerLabel(provider: string | undefined) {
  if (provider === 's3') return 'S3 Storage'
  return 'Google Drive'
}

export function mapFile(file: BackendFile): FileItem {
  return { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, createdAt: file.createdAt, accountEmail: file.connectedAccount?.email, accountProvider: providerLabel(file.connectedAccount?.provider), date: formatDate(file.createdAt), size: formatBytes(file.sizeBytes), access: file.connectedAccount?.email ?? providerLabel(file.connectedAccount?.provider), kind: mimeToKind(file.mimeType), shared: 1, folderId: file.folderId, folderName: file.folder?.name }
}

export function mapFolder(folder: BackendFolder): FolderItem {
  return { id: folder.id, name: folder.name, color: folder.color, iconUrl: folder.iconUrl, parentId: folder.parentId, providerFolderId: folder.providerFolderId, updated: `Updated ${formatDate(folder.updatedAt)}` }
}

export const sizeActiveClasses: Record<FolderSizeScale, string> = {
  xs: 'bg-white text-slate-800 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30 shadow-sm dark:shadow-none',
  sm: 'bg-white text-slate-800 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30 shadow-sm dark:shadow-none',
  md: 'bg-white text-slate-800 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30 shadow-sm dark:shadow-none',
  lg: 'bg-white text-slate-800 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30 shadow-sm dark:shadow-none'
}
