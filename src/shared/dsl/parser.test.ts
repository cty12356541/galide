/**
 * gal DSL 语法分析器测试
 * 规约依据: .style-spec/layers/dsl/conventions.yaml:19-30 (parser_requirements)
 *          .cursor/rules/testing-conventions.mdc
 */

import { describe, expect, it } from 'vitest'
import { parse } from './parser.js'
import type { SceneNode, ScriptNode } from './types.js'

describe('gal parser', () => {
  it('parses a complete .gal file to AST tree', () => {
    const src = `# 第一章

## 教室·午后
背景: assets/backgrounds/classroom.png
BGM: assets/bgm/gentle_piano.mp3

[角色:小雪 | 立绘:小雪_校服_微笑.png | 位置:左]
小雪: "今天的樱花,真漂亮呢。"

[角色:主角 | 立绘:主角_默认.png | 位置:右]
主角: "……是啊。"

* "邀请她一起看樱花" -> 樱花树下
* "假装没听到" -> 独自回家
* "问她喜欢什么花" -> 樱花雨

## 樱花树下
小雪: "诶?!一起吗?"
`
    const result = parse(src)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const root = result.value as ScriptNode
    expect(root.type).toBe('script')
    const scenes = root.children.filter((n): n is SceneNode => n.type === 'scene')
    expect(scenes.length).toBe(2)

    const classroom = scenes[0]
    expect(classroom?.id).toBe('教室·午后')
    expect(classroom?.background).toBe('assets/backgrounds/classroom.png')
    expect(classroom?.bgm).toBe('assets/bgm/gentle_piano.mp3')

    const dialogues = classroom?.children.filter((c) => c.type === 'dialogue')
    expect(dialogues?.length).toBe(2)
    if (dialogues && dialogues[0]?.type === 'dialogue') {
      expect(dialogues[0].character).toBe('小雪')
      expect(dialogues[0].lines[0]).toBe('今天的樱花,真漂亮呢。')
    }

    const choices = classroom?.children.filter((c) => c.type === 'choice')
    expect(choices?.length).toBe(3)

    const sakura = scenes[1]
    expect(sakura?.id).toBe('樱花树下')
  })

  it('returns empty script for empty source', () => {
    const result = parse('')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.type).toBe('script')
    expect(result.value.children).toEqual([])
  })

  it('handles whitespace-only source as empty script', () => {
    const result = parse('\n\n  \n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.children).toEqual([])
  })

  it('collects background-outside-scene errors instead of throwing', () => {
    const src = '背景: assets/no-scene-bg.png\n'
    const result = parse(src)
    expect(result.ok).toBe(false)
    if (result.ok === false) {
      const err = result.error.find((e) => e.message.includes('背景必须出现在场景块内'))
      expect(err).toBeDefined()
      expect(err?.severity).toBe('error')
    }
  })

  it('collects bgm-outside-scene errors', () => {
    const src = 'BGM: assets/no-scene.mp3\n'
    const result = parse(src)
    expect(result.ok).toBe(false)
    if (result.ok === false) {
      expect(result.error.some((e) => e.message.includes('BGM 必须出现在场景块内'))).toBe(true)
    }
  })

  it('collects choice without target as warning (does not throw)', () => {
    const src = '## scene\n小雪: "hi"\n* "选项文本"\n'
    const result = parse(src)
    // 没有 -> 目标是 warning 级别,parser 仍然 ok
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const scene = result.value.children.find((c): c is SceneNode => c.type === 'scene')
    const choice = scene?.children.find((c) => c.type === 'choice')
    if (choice?.type === 'choice') {
      expect(choice.options[0]?.target).toBe('')
    }
  })

  it('nests scenes with their dialogues correctly', () => {
    const src = `## A
小雪: "line1"
主角: "line2"
## B
主角: "line3"
`
    const result = parse(src)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const scenes = result.value.children.filter((n): n is SceneNode => n.type === 'scene')
    expect(scenes.length).toBe(2)
    expect(scenes[0]?.children.filter((c) => c.type === 'dialogue').length).toBe(2)
    expect(scenes[1]?.children.filter((c) => c.type === 'dialogue').length).toBe(1)
  })

  it('preserves line and column information on parsed nodes', () => {
    const src = '## 场景\n小雪: "hi"\n'
    const result = parse(src)
    if (!result.ok) throw new Error('parse failed')
    const scene = result.value.children.find((c): c is SceneNode => c.type === 'scene')
    expect(scene?.line).toBe(1)
    expect(scene?.column).toBe(1)
  })
})
