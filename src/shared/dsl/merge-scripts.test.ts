import { describe, it, expect } from 'vitest'
import { parse } from './parser.js'
import { mergeScriptAsts } from './merge-scripts.js'

const sceneGal = (id: string, line: string) => `## ${id}\n背景: ${line}\n`

describe('mergeScriptAsts', () => {
  it('合并多文件场景', () => {
    const a = parse(sceneGal('intro', 'room'))
    const b = parse(sceneGal('hall', 'corridor'))
    if (!a.ok || !b.ok) throw new Error('parse failed')
    const merged = mergeScriptAsts([
      { file: 'b.gal', ast: b.value },
      { file: 'a.gal', ast: a.value }
    ])
    const sceneIds = merged.children.filter((c) => c.type === 'scene').map((c) => (c as { id: string }).id)
    expect(sceneIds).toEqual(['intro', 'hall'])
  })

  it('重复 scene ID 后文件覆盖', () => {
    const a = parse(sceneGal('intro', 'old'))
    const b = parse(sceneGal('intro', 'new'))
    if (!a.ok || !b.ok) throw new Error('parse failed')
    const merged = mergeScriptAsts([
      { file: 'a.gal', ast: a.value },
      { file: 'b.gal', ast: b.value }
    ])
    const intro = merged.children.find((c) => c.type === 'scene' && (c as { id: string }).id === 'intro')
    expect(intro && intro.type === 'scene' ? (intro as { background?: string }).background : undefined).toBe('new')
  })
})
