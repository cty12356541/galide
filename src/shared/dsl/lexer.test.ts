/**
 * gal DSL 词法分析器测试
 * 规约依据: .style-spec/layers/dsl/conventions.yaml:11-18 (line_types)
 *          .cursor/rules/testing-conventions.mdc
 */

import { describe, expect, it } from 'vitest'
import { tokenize } from './lexer.js'

describe('gal lexer', () => {
  describe('positive cases — 6 line types', () => {
    it('tokenizes chapter heading (##) 章节行', () => {
      const tokens = tokenize('## 第一章:相遇')
      const scene = tokens.find((t) => t.type === 'scene')
      expect(scene).toBeDefined()
      expect(scene?.value).toBe('第一章:相遇')
      expect(scene?.line).toBe(1)
      expect(scene?.column).toBe(1)
    })

    it('tokenizes background declaration 背景: 路径', () => {
      const tokens = tokenize('背景:assets/backgrounds/classroom.png')
      const bg = tokens.find((t) => t.type === 'background')
      expect(bg).toBeDefined()
      expect(bg?.value).toBe('assets/backgrounds/classroom.png')
      expect(bg?.line).toBe(1)
    })

    it('tokenizes dialogue line 角色: "内容"', () => {
      const tokens = tokenize('小雪: "你好,世界"')
      const dlg = tokens.find((t) => t.type === 'dialogue')
      const text = tokens.find((t) => t.type === 'text')
      expect(dlg?.value).toBe('小雪')
      expect(text?.value).toBe('你好,世界')
    })

    it('tokenizes choice line * "text" -> target', () => {
      const tokens = tokenize('* "邀请她一起看樱花" -> 樱花树下')
      const choice = tokens.find((t) => t.type === 'choice')
      const target = tokens.find((t) => t.type === 'goto')
      expect(choice?.value).toBe('邀请她一起看樱花')
      expect(target?.value).toBe('樱花树下')
    })

    it('tokenizes marker === 节点 ===', () => {
      const tokens = tokenize('=== 樱花树下 ===')
      const marker = tokens.find((t) => t.type === 'marker')
      expect(marker).toBeDefined()
      expect(marker?.value).toBe('樱花树下')
    })

    it('tokenizes comment line // xxx', () => {
      const tokens = tokenize('// 这是一行注释')
      const comment = tokens.find((t) => t.type === 'comment')
      expect(comment).toBeDefined()
      expect(comment?.value).toContain('这是一行注释')
    })
  })

  describe('negative cases', () => {
    it('does not throw on unclosed quote; emits no dialogue token', () => {
      // 没闭合的引号: dialogueRule.test 命中但 tokenize 内部 match 失败 → 返回空 token
      // 验证: 不抛 + 没有 dialogue/text token
      expect(() => tokenize('小雪: "未结束的字符串')).not.toThrow()
      const tokens = tokenize('小雪: "未结束的字符串')
      const dlg = tokens.find((t) => t.type === 'dialogue')
      const text = tokens.find((t) => t.type === 'text')
      expect(dlg).toBeUndefined()
      expect(text).toBeUndefined()
    })

    it('marks pure random gibberish as unknown', () => {
      const tokens = tokenize('@@@random garbage@@@')
      const unknown = tokens.find((t) => t.type === 'unknown')
      expect(unknown).toBeDefined()
      expect(unknown?.value).toContain('random garbage')
    })
  })

  describe('token line/column', () => {
    it('numbers line correctly across multiple lines', () => {
      const src = '## 场景1\n背景: bg.png\n小雪: "hi"\n'
      const tokens = tokenize(src)
      const sceneTok = tokens.find((t) => t.type === 'scene')
      const bgTok = tokens.find((t) => t.type === 'background')
      const dlgTok = tokens.find((t) => t.type === 'dialogue')
      expect(sceneTok?.line).toBe(1)
      expect(bgTok?.line).toBe(2)
      expect(dlgTok?.line).toBe(3)
    })

    it('always emits newline tokens at end of each input line', () => {
      const tokens = tokenize('a\nb\n')
      const newlines = tokens.filter((t) => t.type === 'newline')
      expect(newlines.length).toBeGreaterThanOrEqual(2)
    })
  })
})
