/**
 * PromptDialog — Promise 式输入对话框(替代原生 prompt)
 *
 * 用法(组件内):
 *   const { prompt, PromptDialog } = usePromptDialog()
 *   const name = await prompt({ title: '新建剧本文件名', defaultValue: 'chapter2.gal' })
 *   // name: string | null(null = 取消);JSX 末尾渲染 <PromptDialog />
 *
 * 用法(组件外,如纯 hook):
 *   import { promptDialog } from '../../lib/promise-dialog-store'
 *   // 由 App 顶层 <PromptDialogHost /> 渲染
 *
 * Enter 提交 / Esc 取消;空或纯空白输入禁用提交(与原生 prompt 返回空串即取消的
 * 调用点语义对齐);validate 返回错误文案则阻断提交并展示。ESC 由全局
 * dismissTopModal 单源关闭(同 ConfirmDialog)。
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useStore } from 'zustand'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './dialog'
import { Button } from './button'
import { Input } from './input'
import {
  promiseDialogStore,
  requestPrompt,
  settlePromiseDialog,
  GLOBAL_DIALOG_OWNER,
  type PendingDialog,
  type PromptOptions
} from '../../lib/promise-dialog-store'

const selectPrompt = (
  pending: PendingDialog | null,
  ownerId: string
): Extract<PendingDialog, { kind: 'prompt' }> | null =>
  pending?.kind === 'prompt' && pending.ownerId === ownerId ? pending : null

const PromptDialogView = ({ ownerId }: { ownerId: string }): JSX.Element => {
  const pending = useStore(promiseDialogStore, (s) => selectPrompt(s.pending, ownerId))
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const opts = pending?.opts

  // 每次新请求打开时重置输入状态
  useEffect(() => {
    if (pending) {
      setValue(pending.opts.defaultValue ?? '')
      setError(null)
    }
  }, [pending])

  const submit = (): void => {
    if (!opts) return
    if (!value.trim()) return
    const message = opts.validate?.(value) ?? null
    if (message) {
      setError(message)
      return
    }
    settlePromiseDialog(value)
  }

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && settlePromiseDialog(null)}>
      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }}
      >
        <DialogHeader>
          <DialogTitle>{opts?.title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] text-text-muted">
            {opts?.label ?? '名称'}
            <Input
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value)
                if (error) setError(null)
              }}
              placeholder={opts?.placeholder}
            />
          </label>
          {error ? <p className="mt-1.5 text-[12px] text-danger">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => settlePromiseDialog(null)}>
            {opts?.cancelText ?? '取消'}
          </Button>
          <Button onClick={submit} disabled={!value.trim()}>
            {opts?.confirmText ?? '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** App 顶层挂载一次:渲染 promptDialog()(ownerId = global)发起的请求 */
export const PromptDialogHost = (): JSX.Element => (
  <PromptDialogView ownerId={GLOBAL_DIALOG_OWNER} />
)

export type UsePromptDialog = {
  prompt: (opts: PromptOptions) => Promise<string | null>
  PromptDialog: () => JSX.Element
}

export const usePromptDialog = (): UsePromptDialog => {
  const ownerId = useId()
  const prompt = useCallback(
    (opts: PromptOptions): Promise<string | null> => requestPrompt(opts, ownerId),
    [ownerId]
  )
  const PromptDialog = useCallback(
    (): JSX.Element => <PromptDialogView ownerId={ownerId} />,
    [ownerId]
  )
  return { prompt, PromptDialog }
}
