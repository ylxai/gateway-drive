import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Braces, FileArchive, Gauge, HardDrive, History, Info, LogOut, MoreVertical, Settings, Share2, ShieldCheck, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandLogo } from '@/components/drive/BrandLogo'
import { formatBytes } from '@/lib/api'
import { getGravatarUrl } from '@/lib/gravatar'
import { cn } from '@/lib/utils'
import type { AuthUser } from '@/lib/auth'

export const menu = [
  { label: 'All Files', icon: FileArchive, href: '/all-files' },
  { label: 'Quota Tracker', icon: Gauge, href: '/quota' },
  { label: 'Shared With Me', icon: Share2, href: '/shared' },
  { label: 'Starred', icon: Star, href: '/starred', disabled: true },
  { label: 'Recycle Bin', icon: Trash2, href: '/trash' },
  { label: 'Activity Log', icon: History, href: '/activity' },
  { label: 'Setting', icon: Settings, href: '/settings' },
  { label: 'API Keys', icon: Braces, href: '/api' },
]

type StorageSummary = {
  totalBytes: string
  usedBytes: string
  availableBytes: string
}

type StorageBreakdown = {
  photo: string
  video: string
  document: string
}

// The storage summary response may include a list of connected accounts.
export function SystemInfoDropdown({ storage }: { storage: (StorageSummary & { accounts?: Array<{ id: string; provider: string; status: string; email: string }> }) | null }) {
  const activeGoogle = storage?.accounts?.filter((a) => a.provider === 'google_drive' && a.status === 'connected') ?? []

  return (
    <div className="absolute right-0 top-12 z-50 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/15">
      <div className="border-b border-slate-200 px-4 py-3 bg-slate-50/50">
        <p className="text-sm font-extrabold text-slate-950">Workspace Status & Info</p>
        <p className="text-xs text-slate-500">Overview of your connections & guidelines</p>
      </div>
      <div className="max-h-96 overflow-y-auto p-4 space-y-4">
        {/* Connection status */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Connection Status</h4>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between text-xs rounded-xl bg-slate-50 p-2.5 border border-slate-100">
              <span className="font-semibold text-slate-700">Google Drive accounts</span>
              <span className={activeGoogle.length > 0 ? "text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold border border-emerald-100" : "text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-bold border border-amber-100"}>
                {activeGoogle.length} Connected
              </span>
            </div>
            {activeGoogle.map((acc) => (
              <p key={acc.id} className="text-[11px] text-slate-500 truncate px-2.5">— {acc.email}</p>
            ))}
          </div>
        </div>

        {/* Database & engine status */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5 text-blue-500" /> Storage Engine</h4>
          <div className="mt-2 text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
            <p>• <b>DB Type:</b> PostgreSQL</p>
            <p>• <b>Upload Folder:</b> Google Drive dedicated <code>9drive</code></p>
            <p>• <b>Max Upload Size:</b> 5 GB per stream</p>
          </div>
        </div>

        {/* Tips & Guides */}
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Info className="h-3.5 w-3.5 text-indigo-500" /> Usage Tips</h4>
          <ul className="mt-2 text-[11px] text-slate-500 list-disc list-inside space-y-1 pl-1">
            <li>Virtual folders exist only in your database.</li>
            <li>Physical files are always uploaded straight to Google Drive.</li>
            <li>Use the Sync button to fetch changes made directly on Drive.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function Sidebar({ onNavigate, user, storage, breakdown, onLogout }: { onNavigate?: () => void; user: AuthUser | null; storage: StorageSummary | null; breakdown: StorageBreakdown; onLogout: () => void }) {
  const used = Number(storage?.usedBytes ?? 0)
  const total = Number(storage?.totalBytes ?? 0)
  const progress = total > 0 ? Math.min(100, (used / total) * 100) : 0
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [avatarError, setAvatarError] = useState(false)
  const items = [
    ['Photo', formatBytes(breakdown.photo), 'bg-lime-500'],
    ['Video', formatBytes(breakdown.video), 'bg-yellow-400'],
    ['Document', formatBytes(breakdown.document), 'bg-cyan-400'],
    ['Free Storage', formatBytes(storage?.availableBytes), 'bg-orange-500'],
  ]

  useEffect(() => {
    setAvatarError(false)
    getGravatarUrl(user?.email, 64).then(setProfileImageUrl).catch(() => setProfileImageUrl(''))
  }, [user?.email])

  return (
    <aside className="flex h-full w-64 flex-col border-slate-200/60 bg-slate-50/40 backdrop-blur-xl p-4 lg:border-r">
      <div className="flex items-center gap-2.5 pb-3 pt-1">
        <BrandLogo className="h-8 w-8" />
        <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">9Drive</span>
      </div>

      <div className="flex items-center gap-2.5 border-y border-slate-200/60 py-3 my-3">
        {!profileImageUrl || avatarError ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-sm border border-blue-400/20">
            {(user?.name ?? user?.email ?? 'U').trim().charAt(0).toUpperCase()}
          </div>
        ) : (
          <img
            src={profileImageUrl}
            alt="User avatar"
            className="h-8 w-8 rounded-full border border-slate-200 object-cover"
            onError={() => setAvatarError(true)}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-slate-900 leading-none">{user?.name ?? 'User'}</p>
          <p className="truncate text-xs text-slate-500 mt-1">{user?.email ?? 'Loading...'}</p>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </div>

      <nav className="grid gap-1">
        {menu.map((item) => item.disabled ? (
          <button key={item.label} type="button" disabled className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl px-3.5 text-[13px] font-bold text-slate-400 opacity-60">
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ) : (
          <NavLink key={item.label} to={item.href} onClick={onNavigate} className={({ isActive }) => cn('inline-flex h-10 items-center gap-2.5 rounded-xl px-3.5 text-[13px] font-bold transition-all border border-transparent', isActive ? 'bg-blue-600/10 text-blue-600 border-blue-600/10 shadow-sm' : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900')}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-slate-200/60 pt-4 text-[13px]">
        <div className="mb-3 space-y-1.5">
          {items.map(([label, value, color]) => (
            <div key={label} className="flex items-center justify-between text-slate-500 font-medium">
              <span className="flex items-center gap-1.5"><span className={cn('h-1.5 w-1.5 rounded-full', color)} />{label}</span>
              <span className="font-semibold text-slate-700">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-sm font-bold text-slate-700">
          <span>{formatBytes(storage?.usedBytes)} used</span>
          <span className="text-slate-400">{formatBytes(storage?.totalBytes)}</span>
        </div>
        <div className="my-2 h-1.5 rounded-full bg-slate-200/60 overflow-hidden">
          <div className="h-full rounded-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <Button variant="danger" size="sm" className="mt-3 w-full justify-start h-10 px-3 text-[13px] font-bold" onClick={onLogout}>
          <LogOut className="h-4 w-4" />Log Out
        </Button>
      </div>
    </aside>
  )
}
