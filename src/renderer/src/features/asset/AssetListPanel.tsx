/**
 * AssetListPanel — SidePanel 的 assets 面板
 *
 * 内容:列出项目 assets/{characters,backgrounds,bgm} 三类资源,
 * tab 切换展示 + 双击(暂留 placeholder)。
 *
 * 数据源: window.galide.asset.list(projectPath, kind) — main 端 asset-handlers
 * 返回 { ok, entries: { relPath, kind, size }[] }。
 *
 * 行为:
 *  - 顶部 3 个 tab 按钮(characters / backgrounds / bgm)
 *  - 列表渲染当前 tab 对应 entry,显示文件名 + 大小(KB)
 *  - 错误时降级到空态 + 提示(不 throw,不红屏)
 */

import { useEffect, useState, useCallback } from 'react'
import { Image as ImageIcon, Music, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { ScrollArea } from '../../components/ui/scroll-area'
import { Button } from '../../components/ui/button'
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'
import { useUiStore } from '../../lib/store'
import { getGalide } from '../../lib/ipc/galide-safe'
import { cn } from '../../lib/utils'
import { toast } from '../../components/ui/toast'

type AssetKind = 'characters' | 'backgrounds' | 'bgm'

type AssetEntry = {
  relPath: string
  kind: AssetKind
  size: number
}

const KIND_TABS: { id: AssetKind; label: string; icon: typeof ImageIcon }[] = [
  { id: 'characters', label: '角色', icon: ImageIcon },
  { id: 'backgrounds', label: '背景', icon: ImageIcon },
  { id: 'bgm', label: 'BGM', icon: Music }
]

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const fileNameOf = (relPath: string): string => {
  const slash = relPath.lastIndexOf('/')
  return slash >= 0 ? relPath.slice(slash + 1) : relPath
}

export const AssetListPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const [activeKind, setActiveKind] = useState<AssetKind>('characters')
  const [entries, setEntries] = useState<AssetEntry[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setEntries([])
      return
    }
    const g = getGalide()
    if (!g?.asset?.list) {
      setEntries([])
      return
    }
    setLoading(true)
    try {
      const r = await g.asset.list(projectPath, activeKind)
      setEntries(r?.ok ? r.entries : [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [projectPath, activeKind])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleImport = async (): Promise<void> => {
    if (!projectPath) return
    const g = getGalide()
    if (!g?.asset?.import) return
    const r = await g.asset.import(projectPath, activeKind)
    if (r.canceled) return
    if (!r.ok) {
      toast({ message: r.error ?? '导入失败', variant: 'error' })
      return
    }
    toast({ message: `已导入 ${fileNameOf(r.relPath ?? '')}`, variant: 'success' })
    await refresh()
  }

  const handleDelete = async (relPath: string): Promise<void> => {
    if (!projectPath) return
    if (!window.confirm(`删除 ${fileNameOf(relPath)}?`)) return
    const g = getGalide()
    if (!g?.asset?.delete) return
    const r = await g.asset.delete(projectPath, relPath)
    if (!r.ok) {
      toast({ message: r.error ?? '删除失败', variant: 'error' })
      return
    }
    await refresh()
  }

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <PanelHeader
        title="资产"
        icon={FolderOpen}
        size="md"
        actions={
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="导入" onClick={() => void handleImport()}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
            {KIND_TABS.map((t) => (
              <Button
                key={t.id}
                variant={activeKind === t.id ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setActiveKind(t.id)}
                className={cn('h-7 px-2 text-[11px]', activeKind === t.id && 'bg-bg-elevated')}
              >
                {t.label}
              </Button>
            ))}
          </>
        }
      />
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {!projectPath ? (
            <EmptyState icon={ImageIcon} title="请先打开项目" className="py-6 px-3" />
          ) : loading ? (
            <div className="flex items-center gap-2 text-[11px] text-text-muted px-2 py-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> 加载中…
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title={`尚未导入 ${activeKind}`}
              description={`把素材放到 assets/${activeKind}/`}
              className="py-6 px-3"
            />
          ) : (
            entries.map((e) => (
              <div
                key={e.relPath}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-elevated"
              >
                <ImageIcon className="w-3 h-3 text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] truncate">{fileNameOf(e.relPath)}</div>
                  <div className="text-[10px] text-text-muted">{formatSize(e.size)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  title="删除"
                  onClick={() => void handleDelete(e.relPath)}
                >
                  <Trash2 className="w-3 h-3 text-danger" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}