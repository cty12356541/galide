/**
 * Mosaic 树形结构工具单测
 *
 * 覆盖:
 *   - sanitizeTree 接受合法树,丢弃非法 panel id
 *   - sanitizeTree 接受 null / undefined → DEFAULT_TREE
 *   - getAllLeafIds 收集所有叶子 id
 *   - DEFAULT_TREE 是合法树(所有叶子都在 ALL_PANEL_IDS)
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_TREE, getAllLeafIds, sanitizeTree } from './MosaicRoot'
import { MOSAIC_PANEL_IDS, type PanelId } from './panel-registry'

describe('sanitizeTree', () => {
  it('null → DEFAULT_TREE', () => {
    expect(sanitizeTree(null)).toEqual(DEFAULT_TREE)
  })

  it('undefined → DEFAULT_TREE', () => {
    expect(sanitizeTree(undefined)).toEqual(DEFAULT_TREE)
  })

  it('合法字符串叶子原样返回', () => {
    expect(sanitizeTree('script-editor')).toBe('script-editor')
  })

  it('非法字符串叶子回退到 script-editor', () => {
    expect(sanitizeTree('nope' as unknown as PanelId)).toBe('script-editor')
  })

  it('合法树保留', () => {
    const tree = {
      direction: 'row' as const,
      first: 'script-editor' as const,
      second: {
        direction: 'column' as const,
        first: 'flow-view' as const,
        second: 'preview-canvas' as const
      }
    }
    expect(sanitizeTree(tree)).toEqual(tree)
  })

  it('嵌套非法叶子回退', () => {
    const dirty = {
      direction: 'row' as const,
      first: 'script-editor' as const,
      second: 'bogus-panel' as unknown as PanelId
    }
    const clean = sanitizeTree(dirty)
    expect(clean).toEqual({
      direction: 'row',
      first: 'script-editor',
      second: 'script-editor'
    })
  })
})

describe('getAllLeafIds', () => {
  it('字符串叶子', () => {
    expect(getAllLeafIds('script-editor')).toEqual(['script-editor'])
  })

  it('二层 row 树', () => {
    const tree = {
      direction: 'row' as const,
      first: 'script-editor' as const,
      second: 'flow-view' as const
    }
    expect(getAllLeafIds(tree)).toEqual(['script-editor', 'flow-view'])
  })

  it('三层 column 嵌套', () => {
    const tree = {
      direction: 'column' as const,
      first: {
        direction: 'row' as const,
        first: 'script-editor' as const,
        second: 'flow-view' as const
      },
      second: 'preview-canvas' as const
    }
    expect(getAllLeafIds(tree)).toEqual(['script-editor', 'flow-view', 'preview-canvas'])
  })
})

describe('DEFAULT_TREE 完整性', () => {
  it('所有叶子都在 MOSAIC_PANEL_IDS 中', () => {
    const leaves = getAllLeafIds(DEFAULT_TREE)
    expect(leaves.length).toBeGreaterThan(0)
    for (const leaf of leaves) {
      expect(MOSAIC_PANEL_IDS).toContain(leaf)
    }
  })

  it('包含全部 3 个 mosaic panel(无丢失)', () => {
    const leaves = new Set(getAllLeafIds(DEFAULT_TREE))
    for (const id of MOSAIC_PANEL_IDS) {
      expect(leaves.has(id)).toBe(true)
    }
  })
})
