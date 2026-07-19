/**
 * useKeyboardShortcuts — 全局快捷键 hook(命令注册表 + dispatcher 驱动)
 *
 * 设计:
 *   - App 顶层 mount 一次,监听 window keydown(bubble 阶段)
 *   - 快捷键来自命令注册表(COMMANDS)+ 用户覆盖(偏好面板录制存盘),
 *     "用户覆盖 ?? 默认" 经 effectiveShortcut 解析后灌入 store.resolvedShortcuts
 *   - 录制快捷键时 early-return(use-shortcut-recorder 在 capture 阶段独占)
 *   - 命中命令一律经 useCommandDispatcher 的 dispatchCommand 执行(一条命令 → 一条执行路径)
 *   - 下方保留的旁路均有 owner 注释,不进 dispatcher:
 *       ESC          — 非注册表命令,modal dismiss 单源语义
 *       commandPalette — toggle-close 语义(已开则关)与 modal 占用让出,开启路径仍走 dispatcher
 *       ⌘S saveScript — CodeMirror 焦点时编辑器 Mod-s keymap 自管(owner: ScriptEditor)
 *       ⌘F find      — CodeMirror 焦点时搜索面板 keymap 自管(owner: CodeMirror search)
 *       撤销/重做     — 双执行体按焦点路由(源码 tab → CodeMirror history;卡片 → store 栈)
 *   - modal guard:任一 modal 打开时,除命令面板切换与 ESC 外,其余快捷键 early-return,防叠弹
 *   - 浮出窗 guard:禁用项目级/布局切换/开对话框键,仅放行编辑器内键 + 撤销/重做
 */
import { useEffect } from 'react'
import { useUiStore } from '../store'
import { isFloatingWindow } from '../../app/FloatingPanelHost'
import { useShortcuts } from '../ipc/use-preferences'
import {
  effectiveShortcut,
  acceleratorMatches,
  COMMANDS,
  type CommandId
} from '../command-registry'
import { useCommandDispatcher } from './use-command-dispatcher'

/** 已在主循环之前单独处理的命令(见文件头 owner 注释),主循环跳过防双发 */
const HANDLED_ABOVE: ReadonlySet<CommandId> = new Set([
  'commandPalette',
  'goToFile',
  'togglePreview',
  'saveScript',
  'find',
  'undo',
  'redo'
])

/**
 * useResolvedShortcutsSync — 订阅用户快捷键偏好 → 解析有效 accelerator 灌入 store。
 * 单独拆出:键盘 hook 仅同步读 store.resolvedShortcuts,不耦合 react-query,便于测试。
 * 由 App 挂载一次。store 默认值已是 DEFAULT_SHORTCUTS,故启动即可用,偏好加载后覆盖。
 */
export const useResolvedShortcutsSync = (): void => {
  const shortcutsQuery = useShortcuts()
  useEffect(() => {
    const resolved: Record<string, string> = {}
    for (const cmd of COMMANDS) {
      const acc = effectiveShortcut(cmd.id, shortcutsQuery.data)
      if (acc) resolved[cmd.id] = acc
    }
    useUiStore.getState().setResolvedShortcuts(resolved)
  }, [shortcutsQuery.data])
}

export const useKeyboardShortcuts = (): void => {
  // handler 注册与投递同一入口;dispatchCommand 为稳定引用,effect 只需挂一次
  const { dispatchCommand } = useCommandDispatcher()

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      // 始终读最新 store 状态,避免闭包过期导致 modal guard / dismiss 失效
      const s = useUiStore.getState()
      if (s.shortcutRecording) return
      const meta = e.metaKey || e.ctrlKey
      const anyModalOpen =
        s.commandPaletteOpen ||
        s.preferencesOpen ||
        s.exportDialogOpen ||
        s.commitDialogOpen ||
        s.newProjectDialogOpen ||
        s.promiseDialogOpen

      // ESC 单源:关最上层 modal;浮出窗关窗(非注册表命令,保持内联)
      if (e.key === 'Escape') {
        if (anyModalOpen) {
          e.preventDefault()
          s.dismissTopModal()
        } else if (isFloatingWindow()) {
          e.preventDefault()
          window.close()
        }
        return
      }

      // 命令面板:已开则关(toggle-close 语义特殊);其余 modal 占用时让出;开启走 dispatcher
      if (acceleratorMatches(s.resolvedShortcuts.commandPalette ?? '', e)) {
        if (s.commandPaletteOpen) {
          e.preventDefault()
          s.toggleCommandPalette(false)
          return
        }
        if (anyModalOpen) return
        e.preventDefault()
        void dispatchCommand('commandPalette')
        return
      }
      if (acceleratorMatches(s.resolvedShortcuts.goToFile ?? '', e)) {
        if (anyModalOpen && !s.commandPaletteOpen) return
        e.preventDefault()
        void dispatchCommand('goToFile')
        return
      }

      // modal guard:其余快捷键在 modal 打开时一律不触发,防叠弹
      if (anyModalOpen) return

      // F5 运行预览:无修饰键命令须在 meta guard 前处理
      if (acceleratorMatches(s.resolvedShortcuts.togglePreview ?? '', e)) {
        if (!s.projectPath) return
        e.preventDefault()
        void dispatchCommand('togglePreview')
        return
      }

      const inCodeMirror = !!document.activeElement?.closest?.('.cm-editor')
      const useSourceEditor = s.editorSurface === 'source'

      // ⌘S 保存剧本:CodeMirror 焦点时编辑器 Mod-s keymap 自管(owner: ScriptEditor)
      if (acceleratorMatches(s.resolvedShortcuts.saveScript ?? '', e)) {
        if (inCodeMirror) return
        e.preventDefault()
        void dispatchCommand('saveScript')
        return
      }

      // ⌘F 查找:CodeMirror 焦点时搜索面板 keymap 自管(owner: CodeMirror search)
      if (acceleratorMatches(s.resolvedShortcuts.find ?? '', e)) {
        if (inCodeMirror) return
        e.preventDefault()
        void dispatchCommand('find')
        return
      }

      // 撤销/重做:双执行体按焦点路由(源码 tab → CodeMirror history;卡片 → store 栈)
      const routeToCodeMirror = useSourceEditor || inCodeMirror
      if (acceleratorMatches(s.resolvedShortcuts.undo ?? '', e)) {
        if (routeToCodeMirror) return
        if (s.scriptPast.length > 0) {
          e.preventDefault()
          void dispatchCommand('undo')
        }
        return
      }
      if (acceleratorMatches(s.resolvedShortcuts.redo ?? '', e)) {
        if (routeToCodeMirror) return
        if (s.scriptFuture.length > 0) {
          e.preventDefault()
          void dispatchCommand('redo')
        }
        return
      }

      // 浮出窗 guard:禁用项目级/布局切换/开对话框键(编辑器内键由 CodeMirror 自管)
      if (isFloatingWindow()) return

      // 其余命令:逐个匹配已解析 accelerator,命中则经 dispatcher 执行
      // 仅对需要修饰键的命令参与(无修饰键的纯字符不在此 hook 处理)
      if (!meta) return

      for (const cmd of COMMANDS) {
        if (HANDLED_ABOVE.has(cmd.id)) continue
        const acc = s.resolvedShortcuts[cmd.id]
        if (!acc) continue
        if (!acceleratorMatches(acc, e)) continue
        if (cmd.requiresProject && !s.projectPath) return
        e.preventDefault()
        void dispatchCommand(cmd.id)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dispatchCommand])
}
