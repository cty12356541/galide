/**
 * gal DSL CodeMirror tokenizer & highlight tag map
 *
 * 规约依据:
 *  - .style-spec/layers/dsl/conventions.yaml:11-18 (line_types)
 *  - .style-spec/core/conventions.yaml:17 `editor: "CodeMirror 6 + Lezer"`
 *
 * 历史背景:
 *  该文件原本用 `@lezer/generator` 的 `buildParser()` 在运行时把
 *  `lezer-grammar.js` 编译成 LRParser。但 `@lezer/generator` 通过
 *  `import.meta.url` 启动 worker,Vite 在 renderer dep optimization
 *  阶段把它当 ESM 解析会爆 `Unexpected token '"]"'`。
 *
 *  修复方案:改用 `@codemirror/language` 内置的 `StreamLanguage`,
 *  一个 line-oriented streaming tokenizer 即可,不需要 LR parser。
 *  收益:
 *   - 不再依赖 `@lezer/generator`(已从 devDependencies 移除)
 *   - 200 行内搞定,无运行时编译开销
 *   - 与 DSL 的"行级语义"特性天然契合(conventions.yaml 设计原则)
 *
 *  本文件只暴露:
 *   - `GAL_TOKEN`    — token 字符串常量
 *   - `GalStreamState` — StreamParser 状态类型
 *   - `galParser`    — StreamParser<GalStreamState>(给 StreamLanguage.define 用)
 *   - `galHighlightStyle` — CodeMirror HighlightStyle(挂 EditorView.theme)
 *
 *  CM6 LanguageSupport 在 `renderer/src/lib/codemirror/gal-language.ts` 拼装。
 */

import { tags as t } from '@lezer/highlight'
import { HighlightStyle } from '@codemirror/language'
import type { StreamParser } from '@codemirror/language'
import {
  BACKGROUND_RE,
  BGM_RE,
  CHAPTER_RE,
  CHOICE_RE,
  COMMENT_RE,
  ELIF_RE,
  ELSE_RE,
  GOTO_RE,
  IF_END_RE,
  IF_START_RE,
  MARKER_RE,
  SCENE_RE,
  SET_RE,
  SPRITE_RE,
  DIALOGUE_RE
} from './line-rules.js'

/* ------------------------------------------------------------------ *
 * Token 字符串常量 — StreamParser 返回这些字面量,galTagMap 再做映射
 * ------------------------------------------------------------------ */
export const GAL_TOKEN = {
  Heading1: 'heading1',
  Heading2: 'heading2',
  Property: 'property',
  Sprite: 'sprite',
  Goto: 'goto',
  Control: 'control',
  Choice: 'choice',
  String: 'string',
  Operator: 'operator',
  Function: 'function',
  Label: 'label',
  Comment: 'comment',
  Variable: 'variable',
  Invalid: 'invalid'
} as const

export type GalTokenName = (typeof GAL_TOKEN)[keyof typeof GAL_TOKEN]

/* ------------------------------------------------------------------ *
 * Stream parser 状态
 * ------------------------------------------------------------------ */
export interface GalStreamState {
  /** 当前是否在行首 */
  atLineStart: boolean
}

/* ------------------------------------------------------------------ *
 * StreamParser — line-oriented tokenizer
 * 6 种 DSL 行类型全覆盖 + 注释 / 标记 / 对白 / 跳转 / 立绘
 * ------------------------------------------------------------------ */

export const galParser: StreamParser<GalStreamState> = {
  name: 'gal',
  startState: () => ({ atLineStart: true }),
  blankLine: (_state) => {
    /* keep atLineStart as-is; newline will reset via sol() check */
  },
  token: (stream, state) => {
    // 行首判断:索引进到新行,atLineStart 重置
    if (stream.sol()) {
      state.atLineStart = true
    }
    // 前导空白
    if (stream.eatSpace()) {
      return null
    }

    // 注释
    if (state.atLineStart && stream.match(COMMENT_RE)) {
      return GAL_TOKEN.Comment
    }

    // Marker: === 节点 ===
    if (state.atLineStart && stream.match(MARKER_RE)) {
      return GAL_TOKEN.Label
    }

    // Choice: * "选项" -> 目标
    if (state.atLineStart && stream.match(CHOICE_RE)) {
      return GAL_TOKEN.Choice
    }

    // Chapter heading: # 标题
    if (state.atLineStart && stream.match(CHAPTER_RE)) {
      return GAL_TOKEN.Heading1
    }

    // Scene heading: ## 场景
    if (state.atLineStart && stream.match(SCENE_RE)) {
      return GAL_TOKEN.Heading2
    }

    // 立绘 / 跳转 块: [角色:... | ...]
    if (state.atLineStart && stream.match(SPRITE_RE)) {
      return GAL_TOKEN.Sprite
    }
    if (state.atLineStart && stream.match(GOTO_RE)) {
      return GAL_TOKEN.Goto
    }
    if (state.atLineStart && stream.match(IF_START_RE)) {
      return GAL_TOKEN.Control
    }
    if (state.atLineStart && stream.match(ELIF_RE)) {
      return GAL_TOKEN.Control
    }
    if (state.atLineStart && stream.match(ELSE_RE)) {
      return GAL_TOKEN.Control
    }
    if (state.atLineStart && stream.match(IF_END_RE)) {
      return GAL_TOKEN.Control
    }
    if (state.atLineStart && stream.match(SET_RE)) {
      return GAL_TOKEN.Variable
    }

    // 属性行: 背景:/BGM:
    if (state.atLineStart && stream.match(BACKGROUND_RE)) {
      return GAL_TOKEN.Property
    }
    if (state.atLineStart && stream.match(BGM_RE)) {
      return GAL_TOKEN.Property
    }

    // 对白: 角色名: "对白"
    if (state.atLineStart) {
      if (stream.match(DIALOGUE_RE)) {
        return GAL_TOKEN.Function
      }
    }

    // 兜底:吃掉一个字符
    stream.next()
    return GAL_TOKEN.Invalid
  }
}

/* ------------------------------------------------------------------ *
 * Highlight style — token 字符串 → @lezer/highlight Tag
 * StreamLanguage 把 token 字符串直接当作 tag 名查 HighlightStyle。
 * 这里我们用 `tag` 字段把 (highlight tag) 映射到 CSS,token 字符串是
 * 我们内部约定的命名空间,不需要在 HighlightStyle 里再列一次。
 * ------------------------------------------------------------------ */
export const galHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: '#7c3aed', fontWeight: 'bold' },
  { tag: t.heading2, color: '#a78bfa', fontWeight: 'bold' },
  { tag: t.propertyName, color: '#0891b2' },
  { tag: t.className, color: '#0e7490' },
  { tag: t.controlKeyword, color: '#db2777', fontWeight: 'bold' },
  { tag: t.atom, color: '#f59e0b' },
  { tag: t.string, color: '#16a34a' },
  { tag: t.operator, color: '#64748b' },
  { tag: t.function(t.variableName), color: '#7c3aed', fontWeight: '600' },
  { tag: t.labelName, color: '#ea580c' },
  { tag: t.lineComment, color: '#94a3b8', fontStyle: 'italic' },
  { tag: t.variableName, color: '#475569' },
  { tag: t.invalid, color: '#dc2626', textDecoration: 'underline wavy' }
])
