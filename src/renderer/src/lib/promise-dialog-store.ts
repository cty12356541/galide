/**
 * promise-dialog-store — Promise 式确认/输入对话框的请求调度核心
 *
 * 替代原生 confirm / prompt(同步阻塞、样式不可控):
 *   - confirmDialog(opts) / promptDialog(opts) 可在任意模块调用(组件、hook、命令 dispatcher)
 *   - useConfirmDialog / usePromptDialog(见 components/ui/*-dialog.tsx)供组件按 ownerId 渲染
 *   - 任一时刻仅一个 pending 请求;新请求顶入时旧请求按"取消"语义 resolve,防悬挂
 *   - 打开/关闭同步 uiStore.promiseDialogOpen:modal guard 拦截快捷键,
 *     ESC 单源 dismissTopModal 置 false 后由对话框组件观测并 settle(cancel)
 */
import { createStore } from 'zustand'
import { uiStore } from './ui-store'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作:主按钮使用 destructive 样式,默认聚焦取消按钮 */
  danger?: boolean
}

export type PromptOptions = {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  /** 返回错误文案则阻断提交并在输入框下方展示 */
  validate?: (value: string) => string | null
}

export type PendingDialog =
  | { kind: 'confirm'; ownerId: string; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; ownerId: string; opts: PromptOptions; resolve: (value: string | null) => void }

type PromiseDialogState = {
  pending: PendingDialog | null
}

export const promiseDialogStore = createStore<PromiseDialogState>(() => ({ pending: null }))

const cancelValueOf = (p: PendingDialog): boolean | string | null =>
  p.kind === 'confirm' ? false : null

/** 全局 ownerId:由 App 顶层 <ConfirmDialogHost /> / <PromptDialogHost /> 渲染 */
export const GLOBAL_DIALOG_OWNER = 'global'

const request = <T>(req: Omit<PendingDialog, 'resolve'>): Promise<T> => {
  const existing = promiseDialogStore.getState().pending
  if (existing) {
    ;(existing.resolve as (value: boolean | string | null) => void)(cancelValueOf(existing))
  }
  uiStore.getState().openPromiseDialog()
  return new Promise<T>((resolve) => {
    promiseDialogStore.setState({
      pending: { ...req, resolve: resolve as PendingDialog['resolve'] } as PendingDialog
    })
  })
}

/** 取消当前 pending 请求(ESC / 点遮罩 / 新请求顶入共用) */
export const settlePromiseDialog = (value: boolean | string | null): void => {
  const pending = promiseDialogStore.getState().pending
  if (!pending) return
  promiseDialogStore.setState({ pending: null })
  uiStore.getState().closePromiseDialog()
  ;(pending.resolve as (value: boolean | string | null) => void)(value)
}

/** useConfirmDialog / usePromptDialog 按 ownerId 发起请求(组件自行渲染返回值) */
export const requestConfirm = (opts: ConfirmOptions, ownerId: string): Promise<boolean> =>
  request<boolean>({ kind: 'confirm', ownerId, opts })

export const requestPrompt = (opts: PromptOptions, ownerId: string): Promise<string | null> =>
  request<string | null>({ kind: 'prompt', ownerId, opts })

/** 组件外(命令 dispatcher / 纯 hook)入口:由 App 全局 host 渲染 */
export const confirmDialog = (opts: ConfirmOptions): Promise<boolean> =>
  requestConfirm(opts, GLOBAL_DIALOG_OWNER)

export const promptDialog = (opts: PromptOptions): Promise<string | null> =>
  requestPrompt(opts, GLOBAL_DIALOG_OWNER)

// ESC 单源:dismissTopModal 将 uiStore.promiseDialogOpen 置 false,
// 此处统一观测并按取消语义 settle,组件无需各自监听
uiStore.subscribe((state, prev) => {
  const pending = promiseDialogStore.getState().pending
  if (pending && prev.promiseDialogOpen && !state.promiseDialogOpen) {
    settlePromiseDialog(cancelValueOf(pending))
  }
})
