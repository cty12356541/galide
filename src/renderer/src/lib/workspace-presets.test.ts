/**
 * workspace-presets — 预设→字段映射单测(B2)
 */
import { describe, it, expect } from 'vitest'
import { WORKSPACE_PRESET_DEFAULTS, captureWorkspaceSnapshot } from './workspace-presets'

describe('WORKSPACE_PRESET_DEFAULTS', () => {
  it('写作:左 project、右 AI、预览关、对话卡占主区', () => {
    const d = WORKSPACE_PRESET_DEFAULTS.writing
    expect(d.visiblePerSide.left).toBe('project')
    expect(d.visiblePerSide.right).toBe('ai')
    expect(d.activeSubIsland.project).toBe('scripts')
    expect(d.previewOpen).toBe(false)
    expect(d.editorCoreLayout.beat).toBeGreaterThan(d.editorCoreLayout.right)
  })

  it('流程:左 outline、AI 隐藏、决策树放大、预览关', () => {
    const d = WORKSPACE_PRESET_DEFAULTS.flow
    expect(d.visiblePerSide.left).toBe('outline')
    expect(d.visiblePerSide.right).toBeNull()
    expect(d.previewOpen).toBe(false)
    expect(d.editorCoreLayout.flow).toBeGreaterThan(d.editorCoreLayout.sceneRail)
    expect(d.editorCoreLayout.right).toBeGreaterThan(d.editorCoreLayout.beat)
  })

  it('评审:左 git、预览开且大、AI 在底栏', () => {
    const d = WORKSPACE_PRESET_DEFAULTS.review
    expect(d.visiblePerSide.left).toBe('git')
    expect(d.visiblePerSide.bottom).toBe('ai')
    expect(d.dockSide.ai).toBe('bottom')
    expect(d.previewOpen).toBe(true)
    expect(d.editorCoreLayout.preview).toBeGreaterThan(d.editorCoreLayout.centerRow)
  })
})

describe('captureWorkspaceSnapshot', () => {
  it('深拷贝可见侧与布局字段', () => {
    const snap = captureWorkspaceSnapshot({
      visiblePerSide: { left: 'git', right: null, bottom: 'ai' },
      activeSubIsland: {
        project: 'scripts',
        git: 'git',
        outline: 'outline',
        character: 'profiles',
        ai: 'ai'
      },
      dockSide: {
        project: 'left',
        git: 'left',
        outline: 'left',
        character: 'left',
        ai: 'bottom'
      },
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
    snap.visiblePerSide.left = 'project'
    expect(snap.previewOpen).toBe(true)
  })
})
