import { describe, it, expect } from 'vitest'
import { parse } from '../../../../shared/dsl/parser'
import { extractOutlineScenes } from './outline-scenes'

const SAMPLE = `## 开场
小雪: "你好"

## 相遇
阳: "走吧"

## 选择点
* "留下" -> 开场
`

describe('extractOutlineScenes', () => {
  it('derives scene ids and line numbers from scriptAst', () => {
    const parsed = parse(SAMPLE)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const scenes = extractOutlineScenes(parsed.value)
    expect(scenes.map((s) => s.id)).toEqual(['开场', '相遇', '选择点'])
    expect(scenes.every((s) => s.line > 0)).toBe(true)
  })

  it('returns empty list when ast is null', () => {
    expect(extractOutlineScenes(null)).toEqual([])
  })
})
