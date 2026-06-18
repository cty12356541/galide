/**
 * SideToolWindow 主岛壳测试(功能即岛 v2)
 *
 * 覆盖:
 *   - 多子岛主岛(project/character)渲染 tab 条;单子岛主岛(git/outline/ai)无 tab
 *   - 切 tab → setActiveSubIsland
 *   - 浮出主岛按钮 → openPanel + addFloatingPanel
 *   - 子岛脱离 → tab 浮出态;点击浮出 tab → closePanel 召回
 *   - 关闭按钮 → hideToolWindow
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SideToolWindow } from './SideToolWindow.js'
import { useUiStore } from '../../lib/store.js'
import { TOOL_WINDOWS, TOOL_WINDOW_META, isMultiSubIsland } from './mosaic/panel-registry.js'

vi.mock('@renderer/features/script-editor/ScriptEditor', () => ({ ScriptEditor: () => <div data-testid="editor-stub" /> }))
vi.mock('@renderer/features/flow-view/FlowView', () => ({ FlowView: () => <div data-testid="flow-stub" /> }))
vi.mock('@renderer/features/preview/PreviewCanvas', () => ({ PreviewCanvas: () => <div data-testid="preview-stub" /> }))
vi.mock('@renderer/features/script-editor/ScriptFileTree', () => ({ ScriptFileTree: () => <div data-testid="project-stub" /> }))
vi.mock('@renderer/features/git/GitPanel', () => ({ GitPanel: () => <div data-testid="git-stub" /> }))
vi.mock('@renderer/features/outline/OutlinePanel', () => ({ OutlinePanel: () => <div data-testid="outline-stub" /> }))
vi.mock('@renderer/features/character/CharacterListPanel', () => ({ CharacterListPanel: () => <div data-testid="character-stub" /> }))
vi.mock('@renderer/features/voice/VoicePanel', () => ({ VoicePanel: () => <div data-testid="voice-stub" /> }))
vi.mock('@renderer/features/asset/AssetListPanel', () => ({ AssetListPanel: () => <div data-testid="asset-stub" /> }))
vi.mock('@renderer/features/ai-panel/AiPanel', () => ({ AiPanel: () => <div data-testid="ai-stub" /> }))

const setGalideMock = (api: {
  openPanel: (args: { panelId: string }) => Promise<unknown>
  closePanel: (args: { panelId: string }) => Promise<unknown>
}): void => {
  const w = window as unknown as {
    galide: { workspace: Record<string, unknown> } & Record<string, unknown>
  }
  w.galide = { ...w.galide, workspace: { ...(w.galide?.workspace ?? {}), openPanel: api.openPanel, closePanel: api.closePanel } }
}

describe('SideToolWindow 主岛壳', () => {
  beforeEach(() => {
    useUiStore.setState({
      dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' },
      visiblePerSide: { left: 'project', right: 'ai', bottom: null },
      activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' },
      floatingPanels: []
    })
    setGalideMock({
      openPanel: () => Promise.resolve({ ok: true, windowId: 1 }),
      closePanel: () => Promise.resolve({ ok: true })
    })
  })

  it('多子岛主岛渲染 tab 条,单子岛主岛无 tab', () => {
    const { rerender } = render(<SideToolWindow toolWindowId="project" />)
    expect(screen.getByTestId('sub-tab-project-scripts')).toBeTruthy()
    expect(screen.getByTestId('sub-tab-project-assets')).toBeTruthy()
    rerender(<SideToolWindow toolWindowId="git" />)
    expect(screen.queryByTestId('sub-tab-git-git')).toBeNull()
  })

  it('所有主岛渲染 header + 浮出按钮 + 关闭按钮', () => {
    for (const tw of TOOL_WINDOWS) {
      const { unmount } = render(<SideToolWindow toolWindowId={tw.id} />)
      expect(screen.getByText(TOOL_WINDOW_META[tw.id].title)).toBeTruthy()
      expect(screen.getByTestId(`side-float-${tw.id}`)).toBeTruthy()
      expect(screen.getByTestId(`side-close-${tw.id}`)).toBeTruthy()
      unmount()
    }
  })

  it('isMultiSubIsland 仅 project/character 为真', () => {
    expect(isMultiSubIsland('project')).toBe(true)
    expect(isMultiSubIsland('character')).toBe(true)
    expect(isMultiSubIsland('git')).toBe(false)
    expect(isMultiSubIsland('ai')).toBe(false)
  })

  it('切 tab → setActiveSubIsland', () => {
    render(<SideToolWindow toolWindowId="character" />)
    fireEvent.click(screen.getByTestId('sub-tab-character-voice'))
    expect(useUiStore.getState().activeSubIsland.character).toBe('voice')
  })

  it('浮出主岛 → openPanel + 加入 floatingPanels', async () => {
    const openPanel = vi.fn(() => Promise.resolve({ ok: true as const, windowId: 9 }))
    setGalideMock({ openPanel, closePanel: () => Promise.resolve({ ok: true }) })
    render(<SideToolWindow toolWindowId="git" />)
    fireEvent.click(screen.getByTestId('side-float-git'))
    await waitFor(() => expect(openPanel).toHaveBeenCalledWith({ panelId: 'git' }))
    expect(useUiStore.getState().floatingPanels).toContain('git')
  })

  it('子岛脱离 → 浮出 tab 置灰;点击浮出 tab → closePanel 召回', async () => {
    useUiStore.setState({ floatingPanels: ['voice'] })
    const closePanel = vi.fn(() => Promise.resolve({ ok: true as const }))
    setGalideMock({ openPanel: () => Promise.resolve({ ok: true }), closePanel })
    render(<SideToolWindow toolWindowId="character" />)
    const tab = screen.getByTestId('sub-tab-character-voice')
    // 浮出中的 tab 存在(置灰由 opacity-50 标识)
    expect(tab).toBeTruthy()
    fireEvent.click(tab)
    expect(closePanel).toHaveBeenCalledWith({ panelId: 'voice' })
  })

  it('关闭按钮 → hideToolWindow', () => {
    useUiStore.setState({ visiblePerSide: { left: 'outline', right: null, bottom: null } })
    render(<SideToolWindow toolWindowId="outline" />)
    fireEvent.click(screen.getByTestId('side-close-outline'))
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
  })
})
