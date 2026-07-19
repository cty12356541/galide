/**
 * replace-in-scripts — 跨 .gal 查找替换核心测试
 *
 * 锁定两条语义契约:
 *  1. token 模式边界规则:匹配不得是任何 lexer token 的真子串
 *     (对白正文/注释/散文中的子串不命中;角色名/恰好覆盖 token 命中)。
 *  2. plain 模式:纯子串,上述全部命中(文档化两模式差异)。
 */
import { describe, it, expect } from 'vitest'
import {
  applyMatchesToContent,
  collectReplaceMatches,
  findReplaceMatchesInContent,
  lineTokenRanges,
  MAX_REPLACE_MATCHES,
  type ScriptReplaceMatch
} from './replace-in-scripts.js'

/** 三份 fixture 剧本:角色 `艾` 出现在名位/正文/跳转/立绘/场景/注释等各类上下文 */
const FIXTURE_A = ['## 开场', '艾: "我是艾。"', '雪: "艾艾子今天去了艾河边。"', '[跳转:艾线]', '[跳转:艾]'].join(
  '\n'
)

const FIXTURE_B = ['=== 艾场景 ===', '* "去找艾" -> 艾场景', '// 艾的注释'].join('\n')

const FIXTURE_C = ['[角色:艾 | 立绘:ai.png | 位置:left]', '## 艾', '设: score = 1'].join('\n')

const fixtureFs = (files: Record<string, string>): {
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
} => ({
  readdir: () => Promise.resolve(Object.keys(files)),
  readFile: (path: string) => {
    const name = path.split('/').pop() ?? ''
    const content = files[name]
    if (content === undefined) return Promise.reject(new Error(`ENOENT: ${path}`))
    return Promise.resolve(content)
  }
})

const applyAll = (
  files: Record<string, string>,
  matches: readonly ScriptReplaceMatch[],
  replacement: string
): Record<string, string> => {
  const next: Record<string, string> = { ...files }
  const byFile = new Map<string, ScriptReplaceMatch[]>()
  for (const m of matches) {
    const list = byFile.get(m.file) ?? []
    list.push(m)
    byFile.set(m.file, list)
  }
  for (const [file, list] of byFile) {
    const r = applyMatchesToContent(next[file] ?? '', list, replacement)
    next[file] = r.content
  }
  return next
}

describe('findReplaceMatchesInContent — token 模式边界规则', () => {
  it('对白角色名 token 恰好覆盖 → 命中,正文 text token 真子串 → 不命中', () => {
    const matches = findReplaceMatchesInContent('a.gal', '艾: "我是艾。"', '艾', { mode: 'token' })
    expect(matches).toHaveLength(1)
    expect(matches[0]?.line).toBe(1)
    expect(matches[0]?.column).toBe(1)
    expect(matches[0]?.tokenKind).toBe('dialogue')
    expect(matches[0]?.matchedText).toBe('艾')
  })

  it('NEGATIVE: 散文对白行 `雪: "艾艾子今天去了艾河边。"` 中的 艾 全部不命中(token 模式)', () => {
    const matches = findReplaceMatchesInContent('a.gal', '雪: "艾艾子今天去了艾河边。"', '艾', {
      mode: 'token'
    })
    expect(matches).toHaveLength(0)
  })

  it('对照: 同一散文行 plain 模式命中全部 3 处子串(文档化模式差异)', () => {
    const matches = findReplaceMatchesInContent('a.gal', '雪: "艾艾子今天去了艾河边。"', '艾', {
      mode: 'plain'
    })
    expect(matches).toHaveLength(3)
  })

  it('goto target 真子串(`艾线` 中的 `艾`)不命中;恰好覆盖(`[跳转:艾]`)命中', () => {
    const embedded = findReplaceMatchesInContent('a.gal', '[跳转:艾线]', '艾', { mode: 'token' })
    expect(embedded).toHaveLength(0)
    const exact = findReplaceMatchesInContent('a.gal', '[跳转:艾]', '艾', { mode: 'token' })
    expect(exact).toHaveLength(1)
    expect(exact[0]?.tokenKind).toBe('goto')
  })

  it('注释 comment token 真子串不命中(token),plain 命中', () => {
    expect(findReplaceMatchesInContent('b.gal', '// 艾的注释', '艾', { mode: 'token' })).toHaveLength(0)
    expect(findReplaceMatchesInContent('b.gal', '// 艾的注释', '艾', { mode: 'plain' })).toHaveLength(1)
  })

  it('unknown 行(整行散文)真子串不命中(token),plain 命中', () => {
    const prose = '艾艾子今天去了艾河边'
    expect(findReplaceMatchesInContent('p.gal', prose, '艾', { mode: 'token' })).toHaveLength(0)
    expect(findReplaceMatchesInContent('p.gal', prose, '艾', { mode: 'plain' })).toHaveLength(3)
  })

  it('marker `=== 艾场景 ===` 真子串不命中;场景行 `## 艾` 恰好覆盖命中', () => {
    expect(findReplaceMatchesInContent('b.gal', '=== 艾场景 ===', '艾', { mode: 'token' })).toHaveLength(0)
    const scene = findReplaceMatchesInContent('c.gal', '## 艾', '艾', { mode: 'token' })
    expect(scene).toHaveLength(1)
    expect(scene[0]?.tokenKind).toBe('scene')
  })

  it('立绘行 `[角色:艾 | …]` 的角色名不被任何 token 覆盖 → 命中(tokenKind=plain)', () => {
    const matches = findReplaceMatchesInContent(
      'c.gal',
      '[角色:艾 | 立绘:ai.png | 位置:left]',
      '艾',
      { mode: 'token' }
    )
    expect(matches).toHaveLength(1)
    expect(matches[0]?.tokenKind).toBe('plain')
  })

  it('choice 文本与 goto 复合行:两处 艾 均为 token 真子串,token 模式不命中', () => {
    expect(
      findReplaceMatchesInContent('b.gal', '* "去找艾" -> 艾场景', '艾', { mode: 'token' })
    ).toHaveLength(0)
  })

  it('set 变量名恰好覆盖命中(tokenKind=set);表达式值不被 token 覆盖也命中', () => {
    const name = findReplaceMatchesInContent('v.gal', '设: score = 1', 'score', { mode: 'token' })
    expect(name).toHaveLength(1)
    expect(name[0]?.tokenKind).toBe('set')
  })

  it('空 query → 无匹配', () => {
    expect(findReplaceMatchesInContent('a.gal', FIXTURE_A, '', { mode: 'plain' })).toHaveLength(0)
  })

  it('regex 模式:字符类命中所有 艾/雪 名位;零宽匹配被跳过', () => {
    const matches = findReplaceMatchesInContent('a.gal', '艾: "我是艾。"\n雪: "你好。"', '[艾雪](?=:)', {
      mode: 'plain',
      regex: true
    })
    expect(matches.map((m) => m.matchedText)).toEqual(['艾', '雪'])
    const zeroWidth = findReplaceMatchesInContent('a.gal', '艾: "x"', '艾?', { mode: 'plain', regex: true })
    expect(zeroWidth.every((m) => m.matchedText.length > 0)).toBe(true)
  })

  it('匹配 id 稳定且携带行列与偏移', () => {
    const [m] = findReplaceMatchesInContent('a.gal', '艾: "我是艾。"', '艾', { mode: 'token' })
    if (!m) throw new Error('expected one match')
    expect(m.id).toBe(`a.gal:1:${m.start}:${m.end}`)
    expect(m.start).toBe(0)
    expect(m.end).toBe(1)
  })
})

describe('collectReplaceMatches — 项目级收集', () => {
  const files = { 'a.gal': FIXTURE_A, 'b.gal': FIXTURE_B, 'c.gal': FIXTURE_C }

  it('token 模式跨 3 文件收集:只命中名位/恰覆 token 的 5 处', async () => {
    const r = await collectReplaceMatches('/scripts', '艾', { mode: 'token' }, fixtureFs(files))
    expect(r.truncated).toBe(false)
    expect(r.matches.map((m) => `${m.file}:${m.line}`)).toEqual([
      'a.gal:2',
      'a.gal:5',
      'c.gal:1',
      'c.gal:2'
    ])
  })

  it('plain 模式命中数 > token 模式(散文/注释/真子串全部计入)', async () => {
    const r = await collectReplaceMatches('/scripts', '艾', { mode: 'plain' }, fixtureFs(files))
    expect(r.matches.length).toBeGreaterThan(5)
  })

  it('非 .gal 文件被忽略;空目录 → 空结果', async () => {
    const fs = fixtureFs({ 'a.gal': FIXTURE_A })
    fs.readdir = () => Promise.resolve(['a.gal', 'notes.txt', '.DS_Store'])
    const r = await collectReplaceMatches('/scripts', '艾', { mode: 'plain' }, fs)
    expect(r.matches.every((m) => m.file === 'a.gal')).toBe(true)
  })

  it('readdir ENOENT → 空结果;其他错误 → 抛 READ_FAILED', async () => {
    const enoent = Object.assign(new Error('no dir'), { code: 'ENOENT' })
    const r = await collectReplaceMatches(
      '/nope',
      '艾',
      { mode: 'plain' },
      { readdir: () => Promise.reject(enoent), readFile: () => Promise.resolve('') }
    )
    expect(r.matches).toEqual([])
    await expect(
      collectReplaceMatches(
        '/nope',
        '艾',
        { mode: 'plain' },
        { readdir: () => Promise.reject(new Error('EACCES')), readFile: () => Promise.resolve('') }
      )
    ).rejects.toMatchObject({ code: 'READ_FAILED' })
  })

  it(`超过 ${MAX_REPLACE_MATCHES} 匹配截断并置 truncated`, async () => {
    const big = Array.from({ length: MAX_REPLACE_MATCHES + 20 }, () => '艾: "x"').join('\n')
    const r = await collectReplaceMatches('/scripts', '艾', { mode: 'plain' }, fixtureFs({ 'big.gal': big }))
    expect(r.truncated).toBe(true)
    expect(r.matches).toHaveLength(MAX_REPLACE_MATCHES)
  })
})

describe('applyMatchesToContent — 重命名角色 艾 → 小艾(token 模式)', () => {
  it('跨 3 fixture 应用后:名位/恰覆处替换,正文/注释/真子串保持原样', async () => {
    const files = { 'a.gal': FIXTURE_A, 'b.gal': FIXTURE_B, 'c.gal': FIXTURE_C }
    const r = await collectReplaceMatches('/scripts', '艾', { mode: 'token' }, fixtureFs(files))
    const next = applyAll(files, r.matches, '小艾')

    expect(next['a.gal']).toBe(
      ['## 开场', '小艾: "我是艾。"', '雪: "艾艾子今天去了艾河边。"', '[跳转:艾线]', '[跳转:小艾]'].join(
        '\n'
      )
    )
    // b.gal 在 token 模式零命中,完全不变
    expect(next['b.gal']).toBe(FIXTURE_B)
    expect(next['c.gal']).toBe(
      ['[角色:小艾 | 立绘:ai.png | 位置:left]', '## 小艾', '设: score = 1'].join('\n')
    )
  })

  it('plain 模式对照:正文/注释子串也被替换', async () => {
    const files = { 'a.gal': FIXTURE_A, 'b.gal': FIXTURE_B, 'c.gal': FIXTURE_C }
    const r = await collectReplaceMatches('/scripts', '艾', { mode: 'plain' }, fixtureFs(files))
    const next = applyAll(files, r.matches, '小艾')
    expect(next['a.gal']).toContain('雪: "小艾小艾子今天去了小艾河边。"')
    expect(next['b.gal']).toContain('// 小艾的注释')
  })

  it('stale 防护:matchedText 与区间内容不符 → conflict,不写入', () => {
    const content = '艾: "我是艾。"'
    const stale = { id: 'a.gal:1:0:1', start: 0, end: 1, matchedText: '雪' }
    const r = applyMatchesToContent(content, [stale], '小艾')
    expect(r.content).toBe(content)
    expect(r.applied).toEqual([])
    expect(r.conflicts).toEqual(['a.gal:1:0:1'])
  })

  it('越界区间 → conflict,不写入', () => {
    const r = applyMatchesToContent('艾', [{ id: 'x', start: 0, end: 99, matchedText: '艾' }], '小艾')
    expect(r.conflicts).toEqual(['x'])
    expect(r.content).toBe('艾')
  })

  it('同行多匹配降序应用,偏移互不影响', () => {
    const content = '艾: "艾"'
    const matches = findReplaceMatchesInContent('a.gal', content, '艾', { mode: 'plain' })
    expect(matches).toHaveLength(2)
    const r = applyMatchesToContent(content, matches, '小艾')
    expect(r.content).toBe('小艾: "小艾"')
    expect(r.applied).toHaveLength(2)
  })
})

describe('lineTokenRanges — lexer token 区间推导', () => {
  it('对白行:dialogue 名位 + text 正文区间', () => {
    const ranges = lineTokenRanges('艾: "我是艾。"')
    expect(ranges).toEqual([
      { start: 0, end: 1, type: 'dialogue' },
      { start: 4, end: 8, type: 'text' }
    ])
  })

  it('重复值按序定位:`艾: "艾"` 的 dialogue 与 text 各自归位', () => {
    const ranges = lineTokenRanges('艾: "艾"')
    expect(ranges[0]).toEqual({ start: 0, end: 1, type: 'dialogue' })
    expect(ranges[1]).toEqual({ start: 4, end: 5, type: 'text' })
  })
})
