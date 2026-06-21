import { useEffect, useState } from 'react'
import { FolderPlus, Loader2 } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '../../components/ui/sheet'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useUiStore } from '../../lib/store'
import { useErrorStore } from '../../lib/store'
import { useProject } from '../../lib/ipc/use-project'
import { toast } from '../../components/ui/toast'

type Stage = 'idle' | 'creating'

/**
 * NewProjectDialog — 新建项目对话框(⌘⇧N / 命令面板 / 菜单统一入口)
 *
 * 收口"新建项目":输入项目名 → project.create(name)(main 侧弹原生目录选择器,
 * 在所选目录创建 .galproj + git init)。用户取消目录选择不报错,保留对话框重试。
 * ESC 关闭由全局 dismissTopModal 单源处理(Radix Sheet onOpenChange 兜底)。
 */
export const NewProjectDialog = (): JSX.Element => {
  const open = useUiStore((s) => s.newProjectDialogOpen)
  const close = useUiStore((s) => s.closeNewProjectDialog)
  const project = useProject()
  const pushError = useErrorStore((s) => s.push)
  const [name, setName] = useState('我的项目')
  const [stage, setStage] = useState<Stage>('idle')

  useEffect(() => {
    if (!open) {
      setName('我的项目')
      setStage('idle')
    }
  }, [open])

  const handleCreate = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      pushError({
        code: 'PROJECT_NAME_EMPTY',
        message: '项目名不能为空',
        source: 'project:create'
      })
      return
    }
    setStage('creating')
    const result = await project.create(trimmed)
    setStage('idle')
    if (result && result.ok) {
      toast({ message: '已创建项目', variant: 'success' })
      close()
      return
    }
    // 用户取消目录选择 → 静默保留对话框重试;其余失败报错
    if (result && result.ok !== true && result.error !== 'CANCELED') {
      toast({ message: `创建失败: ${result.error}`, variant: 'error' })
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4" />
            新建项目
          </SheetTitle>
          <SheetDescription>输入项目名称,随后选择项目所在目录。</SheetDescription>
        </SheetHeader>
        <div className="flex-1 px-4 py-2 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-text-muted">
            项目名称
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="我的项目"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && stage === 'idle') void handleCreate()
              }}
            />
          </label>
          <p className="text-[12px] text-text-muted">
            将在所选目录创建 .galproj 清单并初始化 Git 仓库。
          </p>
        </div>
        <SheetFooter>
          <Button variant="ghost" onClick={close} disabled={stage === 'creating'}>
            取消
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={stage === 'creating' || !name.trim()}
          >
            {stage === 'creating' ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <FolderPlus className="w-3.5 h-3.5 mr-1" />
            )}
            {stage === 'creating' ? '创建中' : '创建'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
