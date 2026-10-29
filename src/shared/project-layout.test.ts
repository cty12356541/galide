import { describe, it, expect } from 'vitest'
import {
  galScriptAbs,
  galScriptRel,
  isGalScriptFileName,
  scriptsDirAbs
} from './project-layout.js'

describe('project-layout', () => {
  it('scriptsDirAbs and galScriptAbs support flat and nested .gal paths', () => {
    expect(scriptsDirAbs('/proj')).toBe('/proj/scripts')
    expect(galScriptAbs('/proj', 'chapter1.gal')).toBe('/proj/scripts/chapter1.gal')
    expect(galScriptAbs('/proj', 'act1/chapter1.gal')).toBe('/proj/scripts/act1/chapter1.gal')
    expect(galScriptRel('chapter1.gal')).toBe('scripts/chapter1.gal')
    expect(galScriptRel('act1/chapter1.gal')).toBe('scripts/act1/chapter1.gal')
  })

  it('isGalScriptFileName accepts nested subdirectories and rejects path traversal', () => {
    expect(isGalScriptFileName('chapter1.gal')).toBe(true)
    expect(isGalScriptFileName('act1/chapter1.gal')).toBe(true)
    expect(isGalScriptFileName('act1/part_2/ch-01.gal')).toBe(true)
    expect(isGalScriptFileName('../evil.gal')).toBe(false)
    expect(isGalScriptFileName('act1/../evil.gal')).toBe(false)
    expect(isGalScriptFileName('/abs/evil.gal')).toBe(false)
    expect(isGalScriptFileName('act1\\ch1.gal')).toBe(false)
    expect(isGalScriptFileName('scripts/chapter1.gal')).toBe(false)
  })
})
