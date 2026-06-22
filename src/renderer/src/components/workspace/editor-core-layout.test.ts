import { describe, it, expect } from 'vitest'
import { panelSizesChanged, shouldPatchHorizontalLayout, patchEditorCoreLayout } from './editor-core-layout'

describe('editor-core-layout guards', () => {
  it('panelSizesChanged ignores sub-pixel drift', () => {
    expect(panelSizesChanged(72.1, 72.4)).toBe(false)
    expect(panelSizesChanged(72, 73)).toBe(true)
  })

  it('shouldPatchHorizontalLayout skips unchanged sizes', () => {
    expect(shouldPatchHorizontalLayout({ beat: 72, right: 28 }, [72.2, 28.1])).toBe(false)
    expect(shouldPatchHorizontalLayout({ beat: 72, right: 28 }, [80, 20])).toBe(true)
  })

  it('patchEditorCoreLayout returns null when unchanged', () => {
    expect(patchEditorCoreLayout(['beat', 'right'], [72, 28], { beat: 72, right: 28 })).toBeNull()
    expect(patchEditorCoreLayout(['beat', 'right'], [80, 20], { beat: 72, right: 28 })).toEqual({
      beat: 80,
      right: 20
    })
  })
})
