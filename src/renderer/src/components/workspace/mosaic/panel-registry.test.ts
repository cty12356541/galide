/**
 * panel-registry 一致性测试(功能即岛 v2)
 *
 * 覆盖:
 *   - 主岛→子岛映射正确(project/character 多子岛;git/outline/ai 单子岛)
 *   - getFloatingContent 三类 id 分发(主岛优先,避免 'git' 歧义)
 *   - FLOATABLE_IDS = 编辑器大陆 + 主岛 + 可脱离子岛(scripts/assets/profiles/voice)
 *   - parentOfSubIsland / isFloatableSubIsland
 *   - EDITOR_DOCS 与 MOSAIC_PANEL_IDS 一致(mosaic 树叶子合法性)
 */
import { describe, it, expect } from 'vitest'
import {
  EDITOR_DOCS,
  MOSAIC_PANEL_IDS,
  TOOL_WINDOWS,
  TOOL_WINDOW_META,
  TOOL_WINDOW_IDS,
  SUB_ISLANDS,
  FLOATABLE_IDS,
  isMultiSubIsland,
  isFloatableSubIsland,
  parentOfSubIsland,
  defaultSubIslandOf,
  getFloatingContent,
  isEditorDoc,
  isToolWindowId,
  isSubIslandId
} from './panel-registry'

describe('panel-registry — 主岛/子岛映射', () => {
  it('5 个主岛:project/git/outline/character/ai', () => {
    expect(TOOL_WINDOW_IDS).toEqual(['project', 'git', 'outline', 'character', 'ai'])
  })

  it('project 与 character 是多子岛主岛;git/outline/ai 单子岛', () => {
    expect(isMultiSubIsland('project')).toBe(true)
    expect(isMultiSubIsland('character')).toBe(true)
    expect(isMultiSubIsland('git')).toBe(false)
    expect(isMultiSubIsland('outline')).toBe(false)
    expect(isMultiSubIsland('ai')).toBe(false)
  })

  it('project 子岛 = scripts + assets;character 子岛 = profiles + voice', () => {
    expect(TOOL_WINDOW_META.project.subIslands.map((s) => s.id)).toEqual(['scripts', 'assets'])
    expect(TOOL_WINDOW_META.character.subIslands.map((s) => s.id)).toEqual(['profiles', 'voice'])
  })

  it('defaultSubIslandOf 取首个子岛', () => {
    expect(defaultSubIslandOf('project')).toBe('scripts')
    expect(defaultSubIslandOf('character')).toBe('profiles')
    expect(defaultSubIslandOf('ai')).toBe('ai')
  })

  it('parentOfSubIsland 正确反查', () => {
    expect(parentOfSubIsland('scripts')).toBe('project')
    expect(parentOfSubIsland('voice')).toBe('character')
    expect(parentOfSubIsland('git')).toBe('git')
    expect(parentOfSubIsland('ai')).toBe('ai')
  })
})

describe('panel-registry — 浮出 id 分发', () => {
  it('isFloatableSubIsland 仅多子岛子岛为真', () => {
    expect(isFloatableSubIsland('scripts')).toBe(true)
    expect(isFloatableSubIsland('voice')).toBe(true)
    expect(isFloatableSubIsland('assets')).toBe(true)
    expect(isFloatableSubIsland('profiles')).toBe(true)
    // 单子岛主岛的子岛不单独浮出
    expect(isFloatableSubIsland('git')).toBe(false)
    expect(isFloatableSubIsland('outline')).toBe(false)
    expect(isFloatableSubIsland('ai')).toBe(false)
  })

  it('FLOATABLE_IDS 含 3 编辑器大陆 + 5 主岛 + 4 可脱离子岛 = 12', () => {
    expect(FLOATABLE_IDS).toHaveLength(12)
    for (const d of EDITOR_DOCS) expect(FLOATABLE_IDS).toContain(d)
    for (const t of TOOL_WINDOW_IDS) expect(FLOATABLE_IDS).toContain(t)
    for (const s of ['scripts', 'assets', 'profiles', 'voice']) expect(FLOATABLE_IDS).toContain(s)
  })

  it("getFloatingContent: 'git' 判为主岛(不歧义为子岛)", () => {
    expect(getFloatingContent('git')?.kind).toBe('toolwindow')
    expect(getFloatingContent('script-editor')?.kind).toBe('doc')
    expect(getFloatingContent('voice')?.kind).toBe('sub')
    expect(getFloatingContent('bogus')).toBeNull()
  })

  it('类型守卫互不误判', () => {
    expect(isEditorDoc('script-editor')).toBe(true)
    expect(isToolWindowId('project')).toBe(true)
    expect(isSubIslandId('voice')).toBe(true)
    // 'git' 同属主岛与子岛,主岛守卫优先(此处两者皆 true,但分发先判主岛)
    expect(isToolWindowId('git')).toBe(true)
    expect(isSubIslandId('git')).toBe(true)
    expect(isEditorDoc('project')).toBe(false)
  })

  it('EDITOR_DOCS === MOSAIC_PANEL_IDS(mosaic 树叶子合法集)', () => {
    expect(MOSAIC_PANEL_IDS).toEqual(EDITOR_DOCS)
    expect(MOSAIC_PANEL_IDS).toEqual(['script-editor', 'flow-view', 'preview-canvas'])
  })

  it('SUB_ISLANDS 含全部 7 子岛', () => {
    expect(Object.keys(SUB_ISLANDS).sort()).toEqual(
      ['ai', 'assets', 'git', 'outline', 'profiles', 'scripts', 'voice'].sort()
    )
  })

  it('TOOL_WINDOWS 每项有 title/icon/defaultDock/subIslands', () => {
    for (const tw of TOOL_WINDOWS) {
      expect(tw.title).toBeTruthy()
      expect(tw.icon).toBeTruthy()
      expect(['left', 'right', 'bottom']).toContain(tw.defaultDock)
      expect(tw.subIslands.length).toBeGreaterThanOrEqual(1)
    }
  })
})
