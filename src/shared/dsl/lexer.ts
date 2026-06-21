/**
 * gal DSL 词法分析器
 * 输出 Token[] ,每行最多一个语义节点(保护 git diff 线性)
 *
 * 行类型检测正则来自 line-rules.ts(单一事实源),与 lezer-parser.ts 共用,
 * 消除「同一行在不同上下文被识别为不同类型」的漂移。
 */

import type { Token } from './types.js'
import {
  BACKGROUND_RE,
  BGM_RE,
  CHAPTER_RE,
  CHOICE_FULL_RE,
  COMMENT_RE,
  DIALOGUE_RE,
  ELIF_RE,
  ELSE_RE,
  GOTO_RE,
  IF_END_RE,
  IF_START_RE,
  MARKER_RE,
  SCENE_RE,
  SET_FULL_RE,
  SPRITE_RE
} from './line-rules.js'

type LineRule = {
  test: (line: string) => boolean
  tokenize: (line: string, lineNo: number) => Token[]
}

const chapterRule: LineRule = {
  test: (line) => CHAPTER_RE.test(line) && !SCENE_RE.test(line),
  tokenize: (line, lineNo) => [
    { type: 'chapter', value: line.slice(2).trim(), line: lineNo, column: 1 }
  ]
}

const sceneRule: LineRule = {
  test: (line) => SCENE_RE.test(line),
  tokenize: (line, lineNo) => [
    { type: 'scene', value: line.slice(3).trim(), line: lineNo, column: 1 }
  ]
}

const backgroundRule: LineRule = {
  test: (line) => BACKGROUND_RE.test(line),
  tokenize: (line, lineNo) => {
    const prefix = line.startsWith('背景:') ? '背景:' : 'background:'
    return [
      { type: 'background', value: line.slice(prefix.length).trim(), line: lineNo, column: 1 }
    ]
  }
}

const bgmRule: LineRule = {
  test: (line) => BGM_RE.test(line),
  tokenize: (line, lineNo) => {
    const prefix = line.startsWith('BGM:') ? 'BGM:' : 'bgm:'
    return [
      { type: 'bgm', value: line.slice(prefix.length).trim(), line: lineNo, column: 1 }
    ]
  }
}

/**
 * 立绘行: [角色:名字 | 立绘:asset.png | 位置:left]
 *
 * 发出可区分 token(修复:之前 character/asset/position 全 emit 成 'sprite',
 * parser 无法区分 → sprite 数据丢失):
 *  - character: 丢弃(DialogueNode 无对应字段,且与对白行的角色名冗余)
 *  - asset:     type='sprite'(立绘资源路径)
 *  - position:  type='position'(left/right/center)
 */
const spriteRule: LineRule = {
  test: (line) => SPRITE_RE.test(line),
  tokenize: (line, lineNo) => {
    const body = line.replace(/^\[(角色|character):/, '').replace(/\]$/, '')
    const parts = body.split('|').map((p) => p.trim())
    const spritePart = parts.find((p) => p.startsWith('立绘:') || p.startsWith('sprite:'))
    const positionPart = parts.find((p) => p.startsWith('位置:') || p.startsWith('position:'))
    const sprite = spritePart?.split(':')[1]?.trim()
    const position = positionPart?.split(':')[1]?.trim() as
      | 'left'
      | 'right'
      | 'center'
      | undefined
    const tokens: Token[] = []
    if (sprite) {
      tokens.push({ type: 'sprite', value: sprite, line: lineNo, column: 1 })
    }
    if (position) {
      tokens.push({ type: 'position', value: position, line: lineNo, column: 1 })
    }
    return tokens
  }
}

const gotoRule: LineRule = {
  test: (line) => GOTO_RE.test(line),
  tokenize: (line, lineNo) => {
    const target = line.replace(/^\[(跳转|goto):/, '').replace(/\]$/, '').trim()
    return [{ type: 'goto', value: target, line: lineNo, column: 1 }]
  }
}

const dialogueRule: LineRule = {
  test: (line) => /^[^\s[]/.test(line) && DIALOGUE_RE.test(line),
  tokenize: (line, lineNo) => {
    const match = line.match(DIALOGUE_RE)
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
  test: (line) => CHOICE_FULL_RE.test(line),
  tokenize: (line, lineNo) => {
    const match = line.match(CHOICE_FULL_RE)
    if (!match) return []
    const tokens: Token[] = [
      { type: 'choice', value: match[1] ?? '', line: lineNo, column: 1 }
    ]
    if (match[2]) {
      tokens.push({ type: 'goto', value: match[2].trim(), line: lineNo, column: 1 })
    }
    if (match[3]) {
      tokens.push({ type: 'when', value: match[3].trim(), line: lineNo, column: 1 })
    }
    return tokens
  }
}

const setRule: LineRule = {
  test: (line) => SET_FULL_RE.test(line),
  tokenize: (line, lineNo) => {
    const match = line.match(SET_FULL_RE)
    if (!match) return []
    const opToken =
      match[2] === '+=' ? 'add' : match[2] === '-=' ? 'sub' : 'set'
    return [
      { type: 'set', value: `${match[1] ?? ''}|${opToken}|${match[3]?.trim() ?? ''}`, line: lineNo, column: 1 }
    ]
  }
}

const ifStartRule: LineRule = {
  test: (line) => IF_START_RE.test(line),
  tokenize: (line, lineNo) => {
    const expr = line.replace(/^\[若:\s*/, '').replace(/\]$/, '').trim()
    return [{ type: 'if', value: expr, line: lineNo, column: 1 }]
  }
}

const elifRule: LineRule = {
  test: (line) => ELIF_RE.test(line),
  tokenize: (line, lineNo) => {
    const expr = line.replace(/^\[否则若:\s*/, '').replace(/\]$/, '').trim()
    return [{ type: 'elif', value: expr, line: lineNo, column: 1 }]
  }
}

const elseRule: LineRule = {
  test: (line) => ELSE_RE.test(line),
  tokenize: (line, lineNo) => [{ type: 'else', value: '', line: lineNo, column: 1 }]
}

const endifRule: LineRule = {
  test: (line) => IF_END_RE.test(line),
  tokenize: (line, lineNo) => [{ type: 'endif', value: '', line: lineNo, column: 1 }]
}

const markerRule: LineRule = {
  test: (line) => MARKER_RE.test(line),
  tokenize: (line, lineNo) => {
    const id = line.replace(/^===\s*/, '').replace(/\s*===$/, '').trim()
    return [{ type: 'marker', value: id, line: lineNo, column: 1 }]
  }
}

const commentRule: LineRule = {
  test: (line) => COMMENT_RE.test(line),
  tokenize: (line, lineNo) => [
    { type: 'comment', value: line.replace(/^\s*\/\/\s*/, ''), line: lineNo, column: 1 }
  ]
}

const emptyRule: LineRule = {
  test: (line) => line.trim() === '',
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
  endifRule,
  elifRule,
  elseRule,
  ifStartRule,
  setRule,
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
