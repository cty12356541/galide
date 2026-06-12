/**
 * gal DSL 词法分析器
 * 输出 Token[] ,每行最多一个语义节点(保护 git diff 线性)
 */

import type { Token, TokenType } from './types.js'

type LineRule = {
  test: (line: string) => boolean
  tokenize: (line: string, lineNo: number) => Token[]
}

const isWhitespace = (s: string): boolean => /^\s+$/.test(s)

const chapterRule: LineRule = {
  test: (line) => line.startsWith('# ') && !line.startsWith('## '),
  tokenize: (line, lineNo) => [
    { type: 'chapter', value: line.slice(2).trim(), line: lineNo, column: 1 }
  ]
}

const sceneRule: LineRule = {
  test: (line) => line.startsWith('## '),
  tokenize: (line, lineNo) => [
    { type: 'scene', value: line.slice(3).trim(), line: lineNo, column: 1 }
  ]
}

const backgroundRule: LineRule = {
  test: (line) => line.startsWith('背景:') || line.startsWith('background:'),
  tokenize: (line, lineNo) => {
    const prefix = line.startsWith('背景:') ? '背景:' : 'background:'
    return [
      { type: 'background', value: line.slice(prefix.length).trim(), line: lineNo, column: 1 }
    ]
  }
}

const bgmRule: LineRule = {
  test: (line) => line.startsWith('BGM:') || line.startsWith('bgm:'),
  tokenize: (line, lineNo) => {
    const prefix = line.startsWith('BGM:') ? 'BGM:' : 'bgm:'
    return [
      { type: 'bgm', value: line.slice(prefix.length).trim(), line: lineNo, column: 1 }
    ]
  }
}

const spriteRule: LineRule = {
  test: (line) => line.startsWith('[角色:') || line.startsWith('[character:'),
  tokenize: (line, lineNo) => {
    const body = line.replace(/^\[(角色|character):/, '').replace(/\]$/, '')
    const parts = body.split('|').map((p) => p.trim())
    const character = parts[0] ?? ''
    const spritePart = parts.find((p) => p.startsWith('立绘:') || p.startsWith('sprite:'))
    const positionPart = parts.find((p) => p.startsWith('位置:') || p.startsWith('position:'))
    const sprite = spritePart?.split(':')[1]?.trim()
    const position = positionPart?.split(':')[1]?.trim() as
      | 'left'
      | 'right'
      | 'center'
      | undefined
    return [
      { type: 'sprite', value: character, line: lineNo, column: 1 },
      ...(sprite ? [{ type: 'sprite' as TokenType, value: sprite, line: lineNo, column: 1 }] : []),
      ...(position
        ? [{ type: 'sprite' as TokenType, value: position, line: lineNo, column: 1 }]
        : [])
    ]
  }
}

const gotoRule: LineRule = {
  test: (line) => line.startsWith('[跳转:') || line.startsWith('[goto:'),
  tokenize: (line, lineNo) => {
    const target = line.replace(/^\[(跳转|goto):/, '').replace(/\]$/, '').trim()
    return [{ type: 'goto', value: target, line: lineNo, column: 1 }]
  }
}

const dialogueRule: LineRule = {
  test: (line) => /^[^\s[][^:]*: "/.test(line),
  tokenize: (line, lineNo) => {
    const match = line.match(/^([^:]+): "(.*)"$/)
    if (!match) return []
    const character = match[1]?.trim() ?? ''
    const text = match[2] ?? ''
    return [
      { type: 'dialogue', value: character, line: lineNo, column: 1 },
      { type: 'text', value: text, line: lineNo, column: 1 }
    ]
  }
}

const choiceRule: LineRule = {
  test: (line) => line.trimStart().startsWith('* "'),
  tokenize: (line, lineNo) => {
    const match = line.match(/^\s*\* "(.+?)"(?:\s*->\s*(.+))?$/)
    if (!match) return []
    return [
      { type: 'choice', value: match[1] ?? '', line: lineNo, column: 1 },
      ...(match[2]
        ? [{ type: 'goto' as TokenType, value: match[2].trim(), line: lineNo, column: 1 }]
        : [])
    ]
  }
}

const markerRule: LineRule = {
  test: (line) => /^===\s*[^=]+\s*===$/.test(line),
  tokenize: (line, lineNo) => {
    const id = line.replace(/^===\s*/, '').replace(/\s*===$/, '').trim()
    return [{ type: 'marker', value: id, line: lineNo, column: 1 }]
  }
}

const commentRule: LineRule = {
  test: (line) => line.trimStart().startsWith('//'),
  tokenize: (line, lineNo) => [
    { type: 'comment', value: line.replace(/^\s*\/\/\s*/, ''), line: lineNo, column: 1 }
  ]
}

const emptyRule: LineRule = {
  test: isWhitespace,
  tokenize: () => []
}

const unknownRule: LineRule = {
  test: () => true,
  tokenize: (line, lineNo) => [
    { type: 'unknown', value: line, line: lineNo, column: 1 }
  ]
}

const RULES: LineRule[] = [
  chapterRule,
  sceneRule,
  backgroundRule,
  bgmRule,
  spriteRule,
  gotoRule,
  dialogueRule,
  choiceRule,
  markerRule,
  commentRule,
  emptyRule
]

export const tokenize = (source: string): Token[] => {
  const tokens: Token[] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineNo = i + 1
    if (line === '') {
      tokens.push({ type: 'newline', value: '', line: lineNo, column: 1 })
      continue
    }
    const rule = RULES.find((r) => r.test(line)) ?? unknownRule
    tokens.push(...rule.tokenize(line, lineNo))
    tokens.push({ type: 'newline', value: '', line: lineNo, column: 1 })
  }
  return tokens
}
