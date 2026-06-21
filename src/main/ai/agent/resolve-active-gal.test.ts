import { describe, it, expect } from 'vitest'
import { resolveActiveGalFile } from './resolve-active-gal.js'

describe('resolveActiveGalFile', () => {
  const files = ['a.gal', 'b.gal', 'chapter1.gal']

  it('returns activeScriptFile when it exists in the project', () => {
    expect(resolveActiveGalFile('b.gal', files)).toBe('b.gal')
  })

  it('falls back to first sorted .gal when activeScriptFile is null', () => {
    expect(resolveActiveGalFile(null, files)).toBe('a.gal')
  })

  it('falls back when activeScriptFile is not in directory', () => {
    expect(resolveActiveGalFile('missing.gal', files)).toBe('a.gal')
  })

  it('returns null when no .gal files exist', () => {
    expect(resolveActiveGalFile('b.gal', [])).toBeNull()
  })
})
