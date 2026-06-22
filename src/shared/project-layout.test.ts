import { describe, it, expect } from 'vitest'
import {
  galScriptAbs,
  galScriptRel,
  isGalScriptFileName,
  scriptsDirAbs
} from './project-layout.js'

describe('project-layout', () => {
  it('scriptsDirAbs and galScriptAbs', () => {
    expect(scriptsDirAbs('/proj')).toBe('/proj/scripts')
    expect(galScriptAbs('/proj', 'chapter1.gal')).toBe('/proj/scripts/chapter1.gal')
    expect(galScriptRel('chapter1.gal')).toBe('scripts/chapter1.gal')
  })

  it('isGalScriptFileName rejects path traversal', () => {
    expect(isGalScriptFileName('chapter1.gal')).toBe(true)
    expect(isGalScriptFileName('../evil.gal')).toBe(false)
    expect(isGalScriptFileName('scripts/chapter1.gal')).toBe(false)
  })
})
