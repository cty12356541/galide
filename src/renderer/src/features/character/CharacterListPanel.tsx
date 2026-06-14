import { useState } from 'react'
import { Plus, User, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'
import { useCharacter } from '../../lib/ipc/use-character'
import { useErrorStore } from '../../lib/store'
import { CharacterCardEditor } from './CharacterCardEditor'
// P0-10 修复(2026-06-15): in-flight 之前 CharacterListPanel 嵌套了 ScriptFileTree + VoicePanel
// (P2 #4 button-clickability 老测试断言不嵌套),规约 Rule 1 一个 panel = 一个 feature,
// 嵌套导致 ActivityBar 同时开 characters + scripts 时内容重复。删除嵌套。
import type { CharacterCard } from '../../../../shared/types'
import { CharacterAvatar } from './CharacterAvatar'
import { toast } from '../../components/ui/toast'

export const CharacterListPanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const manifest = useUiStore((s) => s.manifest)
  const setProject = useUiStore((s) => s.setProject)
  const character = useCharacter()
  const pushError = useErrorStore((s) => s.push)
  const [editing, setEditing] = useState<CharacterCard | null>(null)
  const [creating, setCreating] = useState(false)

  const characters = manifest?.characters ?? []

  const handleSave = async (next: CharacterCard): Promise<void> => {
    if (!projectPath || !manifest) return
    if (creating) {
      await character.create(projectPath, next)
    } else {
      await character.update(projectPath, next)
    }
    setProject(projectPath, {
      ...manifest,
      characters: creating
        ? [...characters, next]
        : characters.map((c) => (c.id === next.id ? next : c))
    })
    setEditing(null)
    setCreating(false)
  }

  const handleDelete = async (c: CharacterCard, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (!projectPath || !manifest) return
    const ok = window.confirm(`确认删除角色 "${c.name}"?此操作会写入 .galproj。`)
    if (!ok) return
    const r = await character.delete(projectPath, c.id)
    if (!r?.ok) {
      pushError({
        code: 'CHARACTER_DELETE_FAILED',
        message: r?.error ?? 'unknown',
        source: 'character:delete'
      })
      return
    }
    setProject(projectPath, {
      ...manifest,
      characters: characters.filter((x) => x.id !== c.id)
    })
    if (editing?.id === c.id) setEditing(null)
    toast({ message: `已删除 ${c.name}`, variant: 'success' })
  }

  return (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <div className="h-10 px-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-text-muted" />
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">角色</span>
          <span className="text-[10px] text-text-muted">({characters.length})</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCreating(true)} title="新建角色">
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {characters.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-bg-elevated flex items-center justify-center">
                <User className="w-5 h-5 text-text-muted" />
              </div>
              <p className="text-xs text-text-muted mb-3">还没有角色</p>
              <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                <Plus className="w-3 h-3 mr-1" />
                创建
              </Button>
            </div>
          ) : (
            characters.map((c) => (
              <div
                key={c.id}
                className="group w-full flex items-center gap-1 rounded-lg hover:bg-bg-elevated text-left transition-colors"
              >
                <button
                  onClick={() => setEditing(c)}
                  className="flex-1 flex items-center gap-2.5 p-2 min-w-0"
                >
                  <CharacterAvatar character={c} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-text-muted truncate">{c.personality || '—'}</div>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => void handleDelete(c, e)}
                  title="删除角色"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      {(editing || creating) && (
        <CharacterCardEditor
          character={editing ?? {
            id: `char_${Date.now()}`,
            name: '',
            description: '',
            personality: '',
            spriteSet: []
          }}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
