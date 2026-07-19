/**
 * ConfirmDialog — Promise 式确认对话框(替代原生 confirm)
 *
 * 用法(组件内):
 *   const { confirm, ConfirmDialog } = useConfirmDialog()
 *   const ok = await confirm({ title: '删除角色', description: '...', danger: true })
 *   // JSX 末尾渲染 <ConfirmDialog />
 *
 * 用法(组件外,如命令 dispatcher):
 *   import { confirmDialog } from '../../lib/promise-dialog-store'
 *   if (await confirmDialog({ title: '关闭项目' })) ...
 *   // 由 App 顶层 <ConfirmDialogHost /> 渲染
 *
 * ESC 由全局 dismissTopModal 单源关闭(DialogContent onEscapeKeyDown 拦截 Radix 默认,
 * 避免与命令面板叠加时一次 ESC 连关两层);点遮罩 / 右上角 X 视为取消(resolve false)。
 */
import { useCallback, useId, useRef } from 'react'
import { useStore } from 'zustand'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './dialog'
import { Button } from './button'
import {
  promiseDialogStore,
  requestConfirm,
  settlePromiseDialog,
  GLOBAL_DIALOG_OWNER,
  type ConfirmOptions,
  type PendingDialog
} from '../../lib/promise-dialog-store'

const selectConfirm = (
  pending: PendingDialog | null,
  ownerId: string
): Extract<PendingDialog, { kind: 'confirm' }> | null =>
  pending?.kind === 'confirm' && pending.ownerId === ownerId ? pending : null

const ConfirmDialogView = ({ ownerId }: { ownerId: string }): JSX.Element => {
  const pending = useStore(promiseDialogStore, (s) => selectConfirm(s.pending, ownerId))
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const opts = pending?.opts
  const danger = opts?.danger ?? false

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && settlePromiseDialog(false)}>
      <DialogContent
        className="max-w-sm"
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(danger ? cancelRef : confirmRef).current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{opts?.title}</DialogTitle>
          {opts?.description ? <DialogDescription>{opts.description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} variant="ghost" onClick={() => settlePromiseDialog(false)}>
            {opts?.cancelText ?? '取消'}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'destructive' : 'default'}
            onClick={() => settlePromiseDialog(true)}
          >
            {opts?.confirmText ?? '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** App 顶层挂载一次:渲染 confirmDialog()(ownerId = global)发起的请求 */
export const ConfirmDialogHost = (): JSX.Element => (
  <ConfirmDialogView ownerId={GLOBAL_DIALOG_OWNER} />
)

export type UseConfirmDialog = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  ConfirmDialog: () => JSX.Element
}

export const useConfirmDialog = (): UseConfirmDialog => {
  const ownerId = useId()
  const confirm = useCallback(
    (opts: ConfirmOptions): Promise<boolean> => requestConfirm(opts, ownerId),
    [ownerId]
  )
  const ConfirmDialog = useCallback(
    (): JSX.Element => <ConfirmDialogView ownerId={ownerId} />,
    [ownerId]
  )
  return { confirm, ConfirmDialog }
}
