/**
 * useUiStore — 功能即岛 v2 dock 模型验证
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useUiStore, useErrorStore } from './store'

describe('useUiStore — v2 dock 模型', () => {
  beforeEach(() => {
    useUiStore.setState({
      workspacePreset: 'writing',
      dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' },
      visiblePerSide: { left: 'project', right: 'ai', bottom: null },
      activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' },
      floatingPanels: []
    })
  })

  it('默认 dockSide / visiblePerSide / activeSubIsland', () => {
    const s = useUiStore.getState()
    expect(s.dockSide.ai).toBe('right')
    expect(s.visiblePerSide.left).toBe('project')
    expect(s.visiblePerSide.right).toBe('ai')
    expect(s.activeSubIsland.project).toBe('scripts')
  })

  it('showToolWindow 把主岛置入其 dockSide 侧', () => {
    useUiStore.getState().showToolWindow('git')
    expect(useUiStore.getState().visiblePerSide.left).toBe('git')
  })

  it('hideToolWindow 收起该侧(仅当该侧正是它)', () => {
    useUiStore.getState().hideToolWindow('project')
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
  })

  it('toggleToolWindow 切换可见性', () => {
    useUiStore.getState().toggleToolWindow('project')
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
    useUiStore.getState().toggleToolWindow('project')
    expect(useUiStore.getState().visiblePerSide.left).toBe('project')
  })

  it('setDockSide 移动主岛:旧侧清空、新侧承接(若原可见)', () => {
    useUiStore.getState().setDockSide('project', 'bottom')
    expect(useUiStore.getState().dockSide.project).toBe('bottom')
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
    expect(useUiStore.getState().visiblePerSide.bottom).toBe('project')
  })

  it('setActiveSubIsland 切 tab', () => {
    useUiStore.getState().setActiveSubIsland('character', 'voice')
    expect(useUiStore.getState().activeSubIsland.character).toBe('voice')
  })

  it('toggleLeftPanel 切换左槽(有内容收起,无则显 project)', () => {
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().visiblePerSide.left).toBe('project')
  })

  it('toggleAiPanel 切换 AI 主岛可见性', () => {
    expect(useUiStore.getState().visiblePerSide.right).toBe('ai')
    useUiStore.getState().toggleAiPanel()
    expect(useUiStore.getState().visiblePerSide.right).toBeNull()
    useUiStore.getState().toggleAiPanel()
    expect(useUiStore.getState().visiblePerSide.right).toBe('ai')
  })

  it('setAiDockedLocation 移 AI 到指定侧并显示', () => {
    useUiStore.getState().setAiDockedLocation('bottom')
    expect(useUiStore.getState().dockSide.ai).toBe('bottom')
    expect(useUiStore.getState().visiblePerSide.right).toBeNull()
    expect(useUiStore.getState().visiblePerSide.bottom).toBe('ai')
  })

  it('addFloatingPanel 三类 id 均可加入且去重', () => {
    useUiStore.getState().addFloatingPanel('script-editor')
    useUiStore.getState().addFloatingPanel('git')
    useUiStore.getState().addFloatingPanel('voice')
    useUiStore.getState().addFloatingPanel('git')
    expect(useUiStore.getState().floatingPanels).toEqual(['script-editor', 'git', 'voice'])
  })

  it('closeProject 清理 projectPath/name/manifest', () => {
    useUiStore.setState({
      projectPath: '/x',
      projectName: 'X',
      manifest: { name: 'X' } as never
    })
    useUiStore.getState().closeProject()
    expect(useUiStore.getState().projectPath).toBeNull()
    expect(useUiStore.getState().projectName).toBeNull()
    expect(useUiStore.getState().manifest).toBeNull()
  })
})

describe('useErrorStore — P1 兼容输入', () => {
  beforeEach(() => {
    useErrorStore.setState({ entries: [] })
  })

  it('push 接受宽松输入(无 id / timestamp)', () => {
    useErrorStore.getState().push({ code: 'TEST', message: 'hi', source: 'unit-test' })
    const entry = useErrorStore.getState().entries[0]
    expect(entry?.id).toBeTruthy()
    expect(typeof entry?.timestamp).toBe('number')
    expect(entry?.code).toBe('TEST')
  })

  it('push 同 id 去重', () => {
    useErrorStore.getState().push({ id: 'fixed-id', code: 'A', message: '1', source: 'x' })
    useErrorStore.getState().push({ id: 'fixed-id', code: 'A', message: '2', source: 'x' })
    const list = useErrorStore.getState().entries.filter((e) => e.id === 'fixed-id')
    expect(list).toHaveLength(1)
    expect(list[0]?.message).toBe('2')
  })

  it('push 超过 MAX_ERROR_ENTRIES(100)裁剪', () => {
    for (let i = 0; i < 110; i++) {
      useErrorStore.getState().push({ code: 'X', message: String(i), source: 'x' })
    }
    expect(useErrorStore.getState().entries.length).toBeLessThanOrEqual(100)
  })
})
