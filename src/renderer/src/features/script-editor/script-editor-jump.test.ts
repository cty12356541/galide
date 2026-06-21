import { describe, it, expect } from 'vitest'
import { diagnosticToScrollTarget, toDocOffset } from './script-editor-jump'

describe('script-editor-jump', () => {
  it('maps parse error line/column to scroll target', () => {
    expect(diagnosticToScrollTarget({ line: 0, column: 0 })).toEqual({ line: 1, column: 1 })
    expect(diagnosticToScrollTarget({ line: 5, column: 3 })).toEqual({ line: 5, column: 3 })
  })

  it('computes doc offset for line/column', () => {
    const source = 'line1\nline2\nline3'
    expect(toDocOffset(source, { line: 1, column: 1 })).toBe(0)
    expect(toDocOffset(source, { line: 2, column: 3 })).toBe(8)
    expect(toDocOffset(source, { line: 3, column: 2 })).toBe(13)
  })
})
