/**
 * gal DSL 序列化器测试
 * 规约依据: serialize 必须与 parser 往返稳定(核心 invariant of 方案 B)
 */
import { describe, expect, it } from 'vitest'
import { parse } from './parser.js'
import { serialize } from './serializer.js'
import type { SceneNode, ScriptNode } from './types.js'

const SAMPLE = `# 第一章

## 教室·午后
背景: assets/backgrounds/classroom.png
BGM: assets/bgm/gentle_piano.mp3

[角色:小雪 | 立绘:小雪_校服_微笑.png | 位置:left]
小雪: "今天的樱花,真漂亮呢。"

[角色:主角 | 立绘:主角_默认.png | 位置:right]
主角: "……是啊。"

* "邀请她一起看樱花" -> 樱花树下
* "假装没听到" -> 独自回家
* "问她喜欢什么花" -> 樱花雨

## 樱花树下
小雪: "诶?!一起吗?"
`

const parseAst = (src: string): ScriptNode => {
  const r = parse(src)
  if (r.ok === false) throw new Error('parse failed: ' + JSON.stringify(r.error))
  return r.value
}

describe('gal serializer', () => {
  it('serialize→parse→serialize 幂等(第二次输出不变)', () => {
    const ast1 = parseAst(SAMPLE)
    const text1 = serialize(ast1)
    const ast2 = parseAst(text1)
    const text2 = serialize(ast2)
    expect(text2).toBe(text1)
  })

  it('往返后场景/对白/选项语义守恒', () => {
    const ast = parseAst(serialize(parseAst(SAMPLE)))
    const scenes = ast.children.filter((n): n is SceneNode => n.type === 'scene')
    expect(scenes.length).toBe(2)
    const classroom = scenes[0]
    expect(classroom?.id).toBe('教室·午后')
    expect(classroom?.background).toBe('assets/backgrounds/classroom.png')
    expect(classroom?.bgm).toBe('assets/bgm/gentle_piano.mp3')
    const dialogues = classroom?.children.filter((c) => c.type === 'dialogue') ?? []
    expect(dialogues.length).toBe(2)
    if (dialogues[0]?.type === 'dialogue') {
      expect(dialogues[0].character).toBe('小雪')
      expect(dialogues[0].sprite).toBe('小雪_校服_微笑.png')
      expect(dialogues[0].position).toBe('left')
      expect(dialogues[0].lines[0]).toBe('今天的樱花,真漂亮呢。')
    }
    const choices = classroom?.children.filter((c) => c.type === 'choice') ?? []
    expect(choices.length).toBe(3)
  })

  it('空脚本序列化为单个换行', () => {
    expect(serialize(parseAst(''))).toBe('\n')
  })

  it('无场景的平铺对白/选项也能落地并往返', () => {
    const src = `小雪: "hi"\n* "go" -> 终点\n`
    const ast = parseAst(src)
    const text = serialize(ast)
    const ast2 = parseAst(text)
    expect(ast2.children.length).toBe(2)
    expect(serialize(ast2)).toBe(text)
  })

  it('marker + goto 往返', () => {
    const src = `## s1\n小雪: "a"\n=== m1 ===\n[跳转:s2]\n## s2\n小雪: "b"\n`
    const ast = parseAst(src)
    const text = serialize(ast)
    const ast2 = parseAst(text)
    expect(serialize(ast2)).toBe(text)
    const s1 = ast2.children.find((n): n is SceneNode => n.type === "scene" && n.id === "s1")
    expect(s1?.children.some((c) => c.type === "marker")).toBe(true)
    expect(s1?.children.some((c) => c.type === "goto")).toBe(true)
  })

  it('sticky sprite 仅在变化时发舞台行(避免冗余)', () => {
    const src = `[角色:小雪 | 立绘:a.png | 位置:left]\n小雪: "1"\n小雪: "2"\n`
    const text = serialize(parseAst(src))
    // 两条同角色同立绘对白 → 仅一条立绘舞台行
    expect(text.match(/\[角色:小雪/g)?.length).toBe(1)
  })

  it('# 章节 round-trip 保留在 .gal 中', () => {
    const src = `# 第一章\n\n## 教室\n主角: "hi"\n`
    const text = serialize(parseAst(src))
    expect(text).toContain('# 第一章')
    expect(serialize(parseAst(text))).toBe(text)
    const ast = parseAst(text)
    expect(ast.children.some((n) => n.type === 'chapter' && n.title === '第一章')).toBe(true)
  })

  it('// 注释 round-trip 保留', () => {
    const src = `## s1\n// TODO: 之后要分叉\n主角: "hi"\n`
    const text = serialize(parseAst(src))
    expect(text).toContain('// TODO: 之后要分叉')
    expect(serialize(parseAst(text))).toBe(text)
  })
})
