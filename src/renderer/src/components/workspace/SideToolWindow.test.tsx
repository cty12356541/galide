/**
 * SideToolWindow 测试 — 功能模块即岛
 *
 * 覆盖:
 *   - 6 个侧边岛各自渲染 header(标题来自 PANEL_META)+ 浮出按钮 + 关闭按钮
 *   - 点浮出 → openPanel(panelId) + 加入 floatingPanels
 *   - 关闭按钮 → toggleLeftPanel
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SideToolWindow } from './SideToolWindow.js'
import { useUiStore } from '../../lib/store.js'
import { PANEL_META, SIDE_PANEL_IDS } from './mosaic/panel-registry.js'

// mock 全部 feature 组件(panel-registry 静态导入,避免 PixiJS/CodeMirror 在测试环境加载)
vi.mock('@renderer/features/script-editor/ScriptEditor', () => ({
  ScriptEditor: () => <div data-testid="editor-stub" />
}))
vi.mock('@renderer/features/flow-view/FlowView', () => ({
  FlowView: () => <div data-testid="flow-stub" />
}))
vi.mock('@renderer/features/preview/PreviewCanvas', () => ({
  PreviewCanvas: () => <div data-testid="preview-stub" />
}))
vi.mock('@renderer/components/workspace/AiToolWindow', () => ({
  AiToolWindow: () => <div data-testid="ai-stub" />
}))
vi.mock('@renderer/features/script-editor/ScriptFileTree', () => ({
  ScriptFileTree: () => <div data-testid="project-stub" />
}))
vi.mock('@renderer/features/git/GitPanel', () => ({
  GitPanel: () => <div data-testid="git-stub" />
}))
vi.mock('@renderer/features/outline/OutlinePanel', () => ({
  OutlinePanel: () => <div data-testid="outline-stub" />
}))
vi.mock('@renderer/features/character/CharacterListPanel', () => ({
  CharacterListPanel: () => <div data-testid="character-stub" />
}))
vi.mock('@renderer/features/voice/VoicePanel', () => ({
  VoicePanel: () => <div data-testid="voice-stub" />
}))
vi.mock('@renderer/features/asset/AssetListPanel', () => ({
  AssetListPanel: () => <div data-testid="asset-stub" />
}))

const setGalideMock = (api: {
  openPanel: (args: { panelId: string }) => Promise<unknown>
}): void => {
  const w = window as unknown as {
    galide: { workspace: { openPanel: typeof api.openPanel } & Record<string, unknown> } & Record<string, unknown>
  }
  w.galide = {
    ...w.galide,
    workspace: { ...(w.galide?.workspace ?? {}), openPanel: api.openPanel }
  }
}

describe('SideToolWindow', () => {
  beforeEach(() => {
    useUiStore.setState({ floatingPanels: [], leftPanelOpen: true })
    setGalideMock({ openPanel: () => Promise.resolve({ ok: true, windowId: 1 }) })
  })

  it.each([...SIDE_PANEL_IDS])('岛 %s 渲染 header + 浮出按钮 + 关闭按钮', (id) => {
    render(<SideToolWindow panelId={id} />)
    expect(screen.getByTestId(`side-tool-window-${id}`)).toBeTruthy()
    expect(screen.getByText(PANEL_META[id].title)).toBeTruthy()
    expect(screen.getByTestId(`side-float-${id}`)).toBeTruthy()
  })

  it('点浮出 → 调用 openPanel 并加入 floatingPanels', async () => {
    const openPanel = vi.fn(() => Promise.resolve({ ok: true as const, windowId: 9 }))
    setGalideMock({ openPanel })
    render(<SideToolWindow panelId="git" />)
    fireEvent.click(screen.getByTestId('side-float-git'))
    await waitFor(() => {
      expect(openPanel).toHaveBeenCalledWith({ panelId: 'git' })
    })
    expect(useUiStore.getState().floatingPanels).toContain('git')
  })

  it('关闭按钮调用 toggleLeftPanel', () => {
    useUiStore.setState({ leftPanelOpen: true })
    render(<SideToolWindow panelId="outline" />)
    fireEvent.click(screen.getByLabelText('关闭 Tool Window'))
    expect(useUiStore.getState().leftPanelOpen).toBe(false)
  })
})
