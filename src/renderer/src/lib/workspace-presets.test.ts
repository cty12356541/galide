/**
 * workspace-presets — 预设→字段映射单测(B2)
 */
import { describe, it, expect } from 'vitest'
import { WORKSPACE_PRESET_DEFAULTS, captureWorkspaceSnapshot, DEFAULT_CENTER_SPLIT } from './workspace-presets'

describe('DEFAULT_CENTER_SPLIT', () => {
  it('对齐写作初始截图三槽比例', () => {
    expect(DEFAULT_CENTER_SPLIT.left + DEFAULT_CENTER_SPLIT.centerWithBoth + DEFAULT_CENTER_SPLIT.right).toBe(100)
  })
})

describe('WORKSPACE_PRESET_DEFAULTS', () => {
  it('写作:左 project、右 AI、预览关、对话卡占主区', () => {
    const d = WORKSPACE_PRESET_DEFAULTS.writing
    expect(d.panelStates.project.visible).toBe(true)
    expect(d.panelStates.ai.visible).toBe(true)
    expect(d.panelStates.project.activeSub).toBe('assets')
    expect(d.previewOpen).toBe(false)
    expect(d.editorCoreLayout.beat).toBe(70)
    expect(d.editorCoreLayout.right).toBe(30)
  })

  it('流程:左 outline、AI 隐藏、决策树放大、预览关', () => {
    const d = WORKSPACE_PRESET_DEFAULTS.flow
    expect(d.panelStates.outline.visible).toBe(true)
    expect(d.panelStates.ai.visible).toBe(false)
    expect(d.previewOpen).toBe(false)
    expect(d.editorCoreLayout.flow).toBeGreaterThan(d.editorCoreLayout.sceneRail)
    expect(d.editorCoreLayout.right).toBeGreaterThan(d.editorCoreLayout.beat)
  })

  it('评审:左 git、预览开且大、AI 在底栏', () => {
    const d = WORKSPACE_PRESET_DEFAULTS.review
    expect(d.panelStates.git.visible).toBe(true)
    expect(d.panelStates.ai.visible).toBe(true)
    expect(d.panelStates.ai.dock).toBe('bottom')
    expect(d.previewOpen).toBe(true)
    expect(d.editorCoreLayout.preview).toBeGreaterThan(d.editorCoreLayout.centerRow)
  })
})

describe('captureWorkspaceSnapshot', () => {
  it('深拷贝 panelStates 与布局字段', () => {
    const panelStates = {
      project: { visible: false, dock: 'left' as const, activeSub: 'scripts' as const },
      git: { visible: true, dock: 'left' as const, activeSub: 'git' as const },
      outline: { visible: false, dock: 'left' as const, activeSub: 'outline' as const },
      character: { visible: false, dock: 'left' as const, activeSub: 'profiles' as const },
      ai: { visible: true, dock: 'bottom' as const, activeSub: 'ai' as const },
      search: { visible: false, dock: 'left' as const, activeSub: 'search' as const },
      brain: { visible: false, dock: 'right' as const, activeSub: 'brain' as const }
    }
    const snap = captureWorkspaceSnapshot({
      panelStates,
      editorCoreLayout: {
        beat: 50,
        right: 50,
        sceneRail: 30,
        flow: 70,
        centerRow: 40,
        preview: 60
      },
      previewOpen: true
    })
    snap.panelStates.git.visible = false
    expect(snap.previewOpen).toBe(true)
  })
})
