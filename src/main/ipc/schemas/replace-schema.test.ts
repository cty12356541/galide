import { describe, it, expect } from 'vitest'
import {
  ScriptReplaceApplySchema,
  ScriptReplaceModeSchema,
  ScriptReplacePreviewSchema,
  ScriptReplaceRollbackSchema
} from './index.js'
import { MAX_REPLACE_MATCHES } from '../../../shared/dsl/replace-in-scripts.js'

const validMatch = {
  id: 'a.gal:2:10:11',
  file: 'a.gal',
  start: 10,
  end: 11,
  matchedText: '艾'
}

describe('ScriptReplacePreviewSchema', () => {
  it('accepts valid payload (plain + token + regex)', () => {
    const r = ScriptReplacePreviewSchema.parse({
      projectPath: '/tmp/p',
      query: '艾',
      mode: 'token',
      regex: false
    })
    expect(r.mode).toBe('token')
  })

  it('rejects empty query', () => {
    expect(() =>
      ScriptReplacePreviewSchema.parse({ projectPath: '/tmp/p', query: '', mode: 'plain' })
    ).toThrow()
  })

  it('rejects unknown mode', () => {
    expect(() => ScriptReplaceModeSchema.parse('fuzzy')).toThrow()
    expect(() =>
      ScriptReplacePreviewSchema.parse({ projectPath: '/tmp/p', query: 'x', mode: 'fuzzy' })
    ).toThrow()
  })

  it('rejects missing projectPath', () => {
    expect(() => ScriptReplacePreviewSchema.parse({ query: 'x', mode: 'plain' })).toThrow()
  })
})

describe('ScriptReplaceApplySchema', () => {
  it('accepts valid payload', () => {
    const r = ScriptReplaceApplySchema.parse({
      projectPath: '/tmp/p',
      replacement: '小艾',
      matches: [validMatch]
    })
    expect(r.matches).toHaveLength(1)
  })

  it('rejects path traversal file name', () => {
    expect(() =>
      ScriptReplaceApplySchema.parse({
        projectPath: '/tmp/p',
        replacement: 'x',
        matches: [{ ...validMatch, file: '../evil.gal' }]
      })
    ).toThrow()
  })

  it('rejects non-.gal file name', () => {
    expect(() =>
      ScriptReplaceApplySchema.parse({
        projectPath: '/tmp/p',
        replacement: 'x',
        matches: [{ ...validMatch, file: 'notes.txt' }]
      })
    ).toThrow()
  })

  it('rejects negative offset / empty matchedText / empty matches', () => {
    expect(() =>
      ScriptReplaceApplySchema.parse({
        projectPath: '/tmp/p',
        replacement: 'x',
        matches: [{ ...validMatch, start: -1 }]
      })
    ).toThrow()
    expect(() =>
      ScriptReplaceApplySchema.parse({
        projectPath: '/tmp/p',
        replacement: 'x',
        matches: [{ ...validMatch, matchedText: '' }]
      })
    ).toThrow()
    expect(() =>
      ScriptReplaceApplySchema.parse({ projectPath: '/tmp/p', replacement: 'x', matches: [] })
    ).toThrow()
  })

  it(`rejects matches beyond cap ${MAX_REPLACE_MATCHES}`, () => {
    const tooMany = Array.from({ length: MAX_REPLACE_MATCHES + 1 }, (_, i) => ({
      ...validMatch,
      id: `a.gal:1:${i}:${i + 1}`
    }))
    expect(() =>
      ScriptReplaceApplySchema.parse({ projectPath: '/tmp/p', replacement: 'x', matches: tooMany })
    ).toThrow()
  })
})

describe('ScriptReplaceRollbackSchema', () => {
  it('accepts valid payload / rejects empty snapshotRef', () => {
    expect(
      ScriptReplaceRollbackSchema.parse({ projectPath: '/tmp/p', snapshotRef: 'abc123' }).snapshotRef
    ).toBe('abc123')
    expect(() =>
      ScriptReplaceRollbackSchema.parse({ projectPath: '/tmp/p', snapshotRef: '' })
    ).toThrow()
  })
})
