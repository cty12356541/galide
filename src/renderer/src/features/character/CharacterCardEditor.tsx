import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Button } from '../../components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import type { CharacterCard } from '../../../../shared/types'
import { CharacterAvatar } from './CharacterAvatar'
import { useUiStore } from '../../lib/store'
import { useImage } from '../../lib/ipc/use-image'
import { toast } from '../../components/ui/toast'

type Props = {
  character: CharacterCard
  onClose: () => void
  onSave: (c: CharacterCard) => Promise<void> | void
}

export const CharacterCardEditor = ({ character, onClose, onSave }: Props): JSX.Element => {
  const [draft, setDraft] = useState<CharacterCard>(character)
  const [generating, setGenerating] = useState(false)
  const projectPath = useUiStore((s) => s.projectPath)
  const imageApi = useImage()

  const handleAiGenerate = async (): Promise<void> => {
    if (!projectPath || !draft.sdPrompt?.trim()) {
      toast({ message: '请先填写 SD Prompt', variant: 'error' })
      return
    }
    setGenerating(true)
    try {
      const state = draft.spriteSet[0]?.state ?? '默认'
      const r = await imageApi.generate({
        projectPath,
        characterId: draft.id,
        state,
        prompt: draft.sdPrompt
      })
      if (!r?.ok || !r.path) {
        toast({ message: r?.error ?? '立绘生成失败', variant: 'error' })
        return
      }
      setDraft({
        ...draft,
        spriteSet: [{ state, path: r.path }]
      })
      toast({ message: '立绘已生成', variant: 'success' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>角色卡</DialogTitle>
          <DialogDescription>编辑角色名称、性格与立绘设定</DialogDescription>
        </DialogHeader>
        <div className="flex gap-4">
          <CharacterAvatar character={draft} />
          <div className="flex-1 space-y-3">
            <div>
              <label className="text-xs text-text-muted">名字</label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="角色名"
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">性格</label>
              <Input
                value={draft.personality}
                onChange={(e) => setDraft({ ...draft, personality: e.target.value })}
                placeholder="活泼、内向、傲娇..."
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">描述</label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="角色的背景、动机、外貌..."
                rows={4}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">立绘提示词(SD Prompt)</label>
              <Textarea
                value={draft.sdPrompt ?? ''}
                onChange={(e) => setDraft({ ...draft, sdPrompt: e.target.value })}
                placeholder="1girl, school uniform, smile, cherry blossoms..."
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-text-muted">立绘路径</label>
              <Input
                value={draft.spriteSet[0]?.path ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    spriteSet: [{ state: draft.spriteSet[0]?.state ?? '默认', path: e.target.value }]
                  })
                }
                placeholder="assets/characters/koyuki_default.png"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={generating || !draft.sdPrompt?.trim() || !projectPath}
                onClick={() => void handleAiGenerate()}
              >
                {generating ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 mr-1" />
                )}
                AI 补全
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void onSave(draft)} disabled={!draft.name.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
