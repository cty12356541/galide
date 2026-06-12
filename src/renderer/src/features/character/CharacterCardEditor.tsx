import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Button } from '../../components/ui/button'
import { Sparkles } from 'lucide-react'
import type { CharacterCard } from '../../../../shared/types'
import { CharacterAvatar } from './CharacterAvatar'

type Props = {
  character: CharacterCard
  onClose: () => void
  onSave: (c: CharacterCard) => Promise<void> | void
}

export const CharacterCardEditor = ({ character, onClose, onSave }: Props): JSX.Element => {
  const [draft, setDraft] = useState<CharacterCard>(character)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>角色卡</DialogTitle>
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
                value={draft.spriteSet[0]?.path ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    spriteSet: [{ state: '默认', path: e.target.value }]
                  })
                }
                placeholder="1girl, school uniform, smile, cherry blossoms..."
                rows={2}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button variant="secondary" size="sm" disabled>
                <Sparkles className="w-3 h-3 mr-1" />
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
