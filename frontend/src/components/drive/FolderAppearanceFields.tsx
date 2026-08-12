import { Input } from '@/components/ui/input'
import { folderColorOptions, folderIconOptions, normalizeFolderColor } from '@/components/drive/FolderVisual'

export function FolderAppearanceFields({ color, iconUrl, onColorChange, onIconChange }: { color: string; iconUrl: string; onColorChange: (color: string) => void; onIconChange: (iconUrl: string) => void }) {
  const normalizedColor = normalizeFolderColor(color)
  return (
    <div className="grid gap-4">
      <label className="grid gap-2 text-sm font-semibold">Folder Color<Input type="color" value={normalizedColor} onChange={(event) => onColorChange(event.target.value)} className="h-12 p-1" /></label>
      <div className="flex flex-wrap gap-2">{folderColorOptions.map((option) => <button key={option} type="button" onClick={() => onColorChange(option)} className={normalizedColor === option ? 'h-8 w-8 rounded-lg border-2 border-blue-600' : 'h-8 w-8 rounded-lg border border-slate-200'} style={{ backgroundColor: option }} aria-label={`Use ${option} folder color`} />)}</div>
      <div className="grid gap-2 text-sm font-semibold"><span>Folder Icon</span><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{folderIconOptions.map((option) => <button key={option.url} type="button" onClick={() => onIconChange(option.url)} className={iconUrl === option.url ? 'flex h-12 items-center justify-center rounded-xl border-2 border-blue-600 bg-blue-50 p-2' : 'flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-2 hover:bg-slate-100'} title={option.label} aria-label={`Use ${option.label} icon`}><img src={`${option.url}?color=${encodeURIComponent(normalizedColor)}`} alt="" className="h-6 w-6" /></button>)}</div></div>
    </div>
  )
}
