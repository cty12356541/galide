/**
 * FloatingPanelHost — 浮出 BrowserWindow 内容宿主(功能即岛 v2)
 *
 * 触发:URL 含 `?floating=1&panelId=<id>`,按 id 类型分发:
 *   - EditorDoc:文档组件 + 简化 header(标题来自 EDITOR_DOC_META)
 *   - ToolWindow:主岛壳 SideToolWindow(floating),含 tab + 关闭(关闭=window.close)
 *   - SubIsland:子岛组件 + 简化 header(标题来自 SUB_ISLANDS)
 *
 * 非法 panelId → 返 null(避免黑屏)
 */
import { useEffect, useState } from 'react'
import { X, ArrowLeft } from 'lucide-react'
import {
  getFloatingContent,
  FLOATABLE_IDS
} from '../components/workspace/mosaic/panel-registry'
import { SideToolWindow } from '../components/workspace/SideToolWindow'

type FloatingMode = { enabled: true; panelId: string } | { enabled: false }

const parseFloatingMode = (): FloatingMode => {
  if (typeof window === 'undefined') return { enabled: false }
  const params = new URLSearchParams(window.location.search)
  if (params.get('floating') !== '1') return { enabled: false }
  const raw = params.get('panelId') ?? ''
  if (FLOATABLE_IDS.includes(raw)) {
    return { enabled: true, panelId: raw }
  }
  return { enabled: false }
}

export const FloatingPanelHost = (): JSX.Element | null => {
  const [mode, setMode] = useState<FloatingMode>(() => parseFloatingMode())

  useEffect(() => {
    if (!mode.enabled) {
      const m = parseFloatingMode()
      if (m.enabled) setMode(m)
    }
  }, [mode.enabled])

  if (!mode.enabled) return null

  const content = getFloatingContent(mode.panelId)
  if (!content) return null

  // 主岛:渲染主岛壳(floating 模式自带 header + tab + 关闭)
  if (content.kind === 'toolwindow') {
    return (
      <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden p-2" data-testid="floating-host">
        <SideToolWindow toolWindowId={content.id} floating />
      </div>
    )
  }

  // 编辑器大陆 doc / 子岛:简化 header + 内容组件
  const Comp = content.component
  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden p-2" data-testid="floating-host">
      <header
        className="h-9 flex items-center border border-border rounded-t-xl px-3 gap-2 flex-shrink-0 bg-surface shadow-sm"
        data-testid="floating-header"
      >
        <span className="text-xs font-medium">{content.title}</span>
        <span className="ml-1 px-1.5 rounded bg-bg-elevated text-[9px] uppercase text-text-muted">
          浮出
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            void window.galide.workspace.focusMain()
          }}
          title="返回主窗口(聚焦主窗口)"
          aria-label="返回主窗口"
          data-testid="floating-back"
          className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-accent hover:bg-accent-soft transition-colors text-xs font-medium border border-accent/30"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>主窗口</span>
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          title="关闭浮出窗口"
          aria-label="关闭浮出窗口"
          data-testid="floating-close"
          className="h-7 w-7 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden bg-surface border border-t-0 border-border rounded-b-xl shadow-md" data-testid="floating-content">
        <Comp />
      </main>
    </div>
  )
}

/** 检测当前窗口是否处于 floating 模式(供 App.tsx 入口判断) */
export const isFloatingWindow = (): boolean => parseFloatingMode().enabled
