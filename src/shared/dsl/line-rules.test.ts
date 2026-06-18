/**
 * line-rules 一致性测试 — 保证 lexer 与 lezer 用同一套规则判定行类型,
 * 防止漂移回归(marker 空格、choice 引号等历史裂缝)。
 */
import { describe, it, expect } from 'vitest'
import { detectLineType } from './line-rules.js'

describe('line-rules detectLineType', () => {
  const cases: Array<{ line: string; type: ReturnType<typeof detectLineType> }> = [
    { line: '# 第一章', type: 'chapter' },
    { line: '## 教室', type: 'scene' },
    { line: '背景: bg.png', type: 'background' },
    { line: 'background: bg.png', type: 'background' },
    { line: 'BGM: a.mp3', type: 'bgm' },
    { line: 'bgm: a.mp3', type: 'bgm' },
    { line: '[角色:小雪 | 立绘:a.png | 位置:左]', type: 'sprite' },
    { line: '[character:Alice | sprite:a.png | position:left]', type: 'sprite' },
    { line: '[跳转:目标]', type: 'goto' },
    { line: '[goto:target]', type: 'goto' },
    { line: '* "选项" -> 目标', type: 'choice' },
    { line: '  * "缩进选项"', type: 'choice' },
    { line: '=== 樱花树下 ===', type: 'marker' },
    { line: '===樱花树下===', type: 'marker' },
    { line: '// 注释', type: 'comment' },
    { line: '  // 缩进注释', type: 'comment' },
    { line: '小雪: "你好"', type: 'dialogue' },
    { line: '', type: 'empty' },
    { line: '   ', type: 'empty' },
    { line: '@@@garbage@@@', type: 'unknown' }
  ]

  for (const { line, type } of cases) {
    it(`detects "${line.replace(/\n/g, '\\n')}" as ${type}`, () => {
      expect(detectLineType(line)).toBe(type)
    })
  }

  it('chapter (#) does not false-positive on scene (##)', () => {
    expect(detectLineType('## 场景')).toBe('scene')
    expect(detectLineType('## 场景')).not.toBe('chapter')
  })

  it('choice requires quotes (* "..." not * foo)', () => {
    expect(detectLineType('* "quoted"')).toBe('choice')
    expect(detectLineType('* unquoted')).toBe('unknown')
  })
})
