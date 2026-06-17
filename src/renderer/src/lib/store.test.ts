/**
 * useUiStore 简化后状态形状验证
 * P1 重构(2026-06-17): 验证 5 个标量字段 + 4 个 action + 兼容 ErrorEntry
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useUiStore, useErrorStore } from './store'

describe('useUiStore — P1 简化', () => {
  beforeEach(() => {
    useUiStore.setState({
      workspacePreset: 'writing',
      leftPanelOpen: true,
      leftPanel: 'project',
      aiPanelOpen: true,
      aiDockedLocation: 'right'
    })
  })

  it('默认 5 个标量字段', () => {
    const s = useUiStore.getState()
    expect(s.workspacePreset).toBe('writing')
    expect(s.leftPanelOpen).toBe(true)
    expect(s.leftPanel).toBe('project')
    expect(s.aiPanelOpen).toBe(true)
    expect(s.aiDockedLocation).toBe('right')
  })

  it('setWorkspacePreset 切换 writing/flow/review', () => {
    useUiStore.getState().setWorkspacePreset('flow')
    expect(useUiStore.getState().workspacePreset).toBe('flow')
    useUiStore.getState().setWorkspacePreset('review')
    expect(useUiStore.getState().workspacePreset).toBe('review')
  })

  it('toggleLeftPanel 翻转 leftPanelOpen', () => {
    expect(useUiStore.getState().leftPanelOpen).toBe(true)
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().leftPanelOpen).toBe(false)
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().leftPanelOpen).toBe(true)
  })

  it('setLeftPanel(\'closed\') 自动关 leftPanelOpen', () => {
    useUiStore.getState().setLeftPanel('git')
    expect(useUiStore.getState().leftPanel).toBe('git')
    expect(useUiStore.getState().leftPanelOpen).toBe(true)
    useUiStore.getState().setLeftPanel('closed')
    expect(useUiStore.getState().leftPanel).toBe('closed')
    expect(useUiStore.getState().leftPanelOpen).toBe(false)
  })

  it('toggleAiPanel 翻转 aiPanelOpen', () => {
    expect(useUiStore.getState().aiPanelOpen).toBe(true)
    useUiStore.getState().toggleAiPanel()
    expect(useUiStore.getState().aiPanelOpen).toBe(false)
  })

  it('setAiDockedLocation 切到 bottom/left/floating', () => {
    useUiStore.getState().setAiDockedLocation('bottom')
    expect(useUiStore.getState().aiDockedLocation).toBe('bottom')
    useUiStore.getState().setAiDockedLocation('floating')
    expect(useUiStore.getState().aiDockedLocation).toBe('floating')
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
    useErrorStore.getState().push({
      code: 'TEST',
      message: 'hi',
      source: 'unit-test'
    })
    const e = useErrorStore.getState().entries[0]
    expect(e?.id).toBeTruthy()
    expect(typeof e?.timestamp).toBe('number')
    expect(e?.code).toBe('TEST')
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
