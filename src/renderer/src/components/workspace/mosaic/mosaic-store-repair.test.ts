/**
 * sanitizeTreeWithResult 单元测试 (PR3-C)
 *
 * 覆盖:
 *   - null/undefined → DEFAULT_TREE, repaired=false
 *   - 合法树 → 不变, repaired=false
 *   - 非法叶子 → 替换 'script-editor', repaired=true
 *   - 嵌套非法 → 整个树 repaired=true
 *   - 混用合法 + 非法 → repaired=true(整树标记)
 */
import { describe, it, expect } from 'vitest'
import { sanitizeTreeWithResult } from './MosaicRoot.js'

describe('sanitizeTreeWithResult', () => {
  it('null → DEFAULT_TREE, repaired=false', () => {
    const r = sanitizeTreeWithResult(null)
    expect(r.repaired).toBe(false)
  })

  it('undefined → DEFAULT_TREE, repaired=false', () => {
    const r = sanitizeTreeWithResult(undefined)
    expect(r.repaired).toBe(false)
  })

  it('合法字符串叶子', () => {
    const r = sanitizeTreeWithResult('script-editor')
    expect(r.repaired).toBe(false)
    expect(r.tree).toBe('script-editor')
  })

  it('非法字符串叶子 → repaired=true + 默认值', () => {
    const r = sanitizeTreeWithResult('evil' as never)
    expect(r.repaired).toBe(true)
    expect(r.tree).toBe('script-editor')
  })

  it('合法树 → repaired=false', () => {
    const tree = {
      direction: 'row' as const,
      first: 'script-editor' as const,
      second: {
        direction: 'column' as const,
        first: 'flow-view' as const,
        second: 'preview-canvas' as const
      }
    }
    const r = sanitizeTreeWithResult(tree)
    expect(r.repaired).toBe(false)
  })

  it('嵌套一层非法 → repaired=true', () => {
    const dirty = {
      direction: 'row' as const,
      first: 'script-editor' as const,
      second: 'bogus' as never
    }
    const r = sanitizeTreeWithResult(dirty)
    expect(r.repaired).toBe(true)
    expect(r.tree).toEqual({
      direction: 'row',
      first: 'script-editor',
      second: 'script-editor'
    })
  })

  it('深层嵌套非法 → repaired=true(整树标记)', () => {
    const dirty = {
      direction: 'row' as const,
      first: {
        direction: 'column' as const,
        first: 'evil' as never,
        second: 'flow-view' as const
      },
      second: 'preview-canvas' as const
    }
    const r = sanitizeTreeWithResult(dirty)
    expect(r.repaired).toBe(true)
    // 非法位置被替换为默认
    const first = r.tree as { first: { first: string } }
    expect(first.first.first).toBe('script-editor')
  })

  it('ToolWindow 字符串(不在 MOSAIC_PANEL_IDS 中)→ 替换为 script-editor', () => {
    const r = sanitizeTreeWithResult('left-tool-window' as never)
    expect(r.repaired).toBe(true)
    expect(r.tree).toBe('script-editor')
  })
})
