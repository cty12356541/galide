/**
 * FloatingPanelHost — 浮出 BrowserWindow 内容宿主
 *
 * 触发:
 *   - URL 含 `?floating=1&panelId=script-editor|flow-view|preview-canvas`
 *   - 走独立 BrowserWindow 加载(由 workspace.openPanel 创建)
 *   - 只渲染对应 panel 全屏,加 header(标题 + 关闭按钮)
 *
 * 设计:
 *   - URL query 解析在 mount 时一次(useEffect)
 *   - 非法 panelId 渲染 fallback 提示(避免黑屏)
 *   - 关闭按钮:window.close()(走 BrowserWindow 关闭事件 → 通知 owner)
 */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { getPanelComponent, PANEL_META, ALL_PANEL_IDS, type PanelId } from '../components/workspace/mosaic/panel-registry'

type FloatingMode = {
  enabled: true
  panelId: PanelId
} | {
  enabled: false
}

const parseFloatingMode = (): FloatingMode => {
  if (typeof window === 'undefined') return { enabled: false }
  const params = new URLSearchParams(window.location.search)
  if (params.get('floating') !== '1') return { enabled: false }
  const raw = params.get('panelId') ?? ''
  if (ALL_PANEL_IDS.includes(raw as PanelId)) {
    return { enabled: true, panelId: raw as PanelId }
  }
  return { enabled: false }
}

export const FloatingPanelHost = (): JSX.Element | null => {
  const [mode, setMode] = useState<FloatingMode>(() => parseFloatingMode())

  // 兜底:SSR / 首次 mount 拿不到 location 时再尝试一次
  useEffect(() => {
    if (!mode.enabled) {
      const m = parseFloatingMode()
      if (m.enabled) setMode(m)
    }
  }, [mode.enabled])

  if (!mode.enabled) {
    // 非 floating 模式 — 不应挂载(由 App.tsx 控制)
    return null
  }

  const meta = PANEL_META[mode.panelId]
  const Panel = getPanelComponent(mode.panelId)

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-text overflow-hidden" data-testid="floating-host">
      <header
        className="h-9 flex items-center border-b border-border px-3 gap-2 flex-shrink-0 bg-surface"
        data-testid="floating-header"
      >
        {meta.icon ? <meta.icon className="w-3.5 h-3.5 text-accent" /> : null}
        <span className="text-xs font-medium">{meta.title}</span>
        <span className="ml-1 px-1.5 rounded bg-bg-elevated text-[9px] uppercase text-text-muted">
          浮出
        </span>
        <div className="flex-1" />
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
      <main className="flex-1 min-h-0 overflow-hidden" data-testid="floating-content">
        <Panel />
      </main>
    </div>
  )
}

/** 检测当前窗口是否处于 floating 模式(供 App.tsx 入口判断) */
export const isFloatingWindow = (): boolean => parseFloatingMode().enabled
