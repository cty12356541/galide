/**
 * gal DSL 行类型规则 — 单一事实源(Single Source of Truth)
 *
 * 同一份 `.gal` 文本在三个上下文被消费:
 *  - lexer.ts(主解析器,产 AST)
 *  - lezer-parser.ts(CodeMirror 高亮 StreamLanguage)
 *  - web-composer.ts(导出播放器,Batch 3 改用 ctx.asts 后不再自行解析)
 *
 * 之前三处各自维护正则,已漂移(marker 空格要求不同、choice 规则不同)。
 * 本文件集中所有行类型检测正则 + detectLineType,lexer 与 lezer 共用,
 * 消除「同一行在不同上下文被识别为不同类型」的裂缝。
 *
 * 规约依据: .style-spec/layers/dsl/conventions.yaml:11-18 (line_types)
 */

/** 行类型(与 TokenType 语义对齐,不含 newline/whitespace/unknown) */
export type LineType =
  | 'chapter'
  | 'scene'
  | 'background'
  | 'bgm'
  | 'sprite'
  | 'goto'
  | 'dialogue'
  | 'choice'
  | 'marker'
  | 'comment'
  | 'empty'
  | 'unknown'

/* ------------------------------------------------------------------ *
 * 共享正则 — lexer 与 lezer 引用同一组,杜绝漂移
 * ------------------------------------------------------------------ */

/** 章节行: `# 标题`(但非 `## `,scene 优先) */
export const CHAPTER_RE = /^# .+/

/** 场景行: `## 场景名` */
export const SCENE_RE = /^## .+/

/** 背景行: `背景:` / `background:` */
export const BACKGROUND_RE = /^(背景|background):.*/

/** BGM 行: `BGM:` / `bgm:` */
export const BGM_RE = /^(BGM|bgm):.*/

/** 立绘行: `[角色:... | 立绘:... | 位置:...]` / `[character:...]` */
export const SPRITE_RE = /^\[(角色|character):.*\]/

/** 跳转行: `[跳转:目标]` / `[goto:目标]` */
export const GOTO_RE = /^\[(跳转|goto):.*\]/

/** 标记行: `=== 节点名 ===`(允许 `===x===` 与 `=== x ===`) */
export const MARKER_RE = /^===\s*[^=]+\s*===$/

/** 选项行: `* "文本" -> 目标`(允许前导空白) */
export const CHOICE_RE = /^\s*\* ".+"/

/** 注释行: `// ...`(允许前导空白) */
export const COMMENT_RE = /^\s*\/\/.*/

/** 空白行 */
export const EMPTY_RE = /^\s*$/

/** 对白行前缀检测: `角色名: "..."`(首字符非空白非 `[`) */
export const DIALOGUE_PREFIX_RE = /^[^\s[].*:\s*".*"/

/** 对白行完整捕获: character + text */
export const DIALOGUE_RE = /^([^:]+):\s*"(.*)"$/

/** 选项行完整捕获: text + 可选 target */
export const CHOICE_FULL_RE = /^\s*\* "(.+?)"(?:\s*->\s*(.+))?$/

/**
 * 检测单行类型(ordered — 优先级高的在前)。
 * scene 在 chapter 前(`## ` 不被 `# ` 误捕);sprite/goto 在 dialogue 前(都含 `[`)。
 * lexer 与 lezer 都应通过此函数判定,保证一致。
 */
export const detectLineType = (line: string): LineType => {
  if (EMPTY_RE.test(line)) return 'empty'
  if (SCENE_RE.test(line)) return 'scene'
  if (CHAPTER_RE.test(line)) return 'chapter'
  if (BACKGROUND_RE.test(line)) return 'background'
  if (BGM_RE.test(line)) return 'bgm'
  if (SPRITE_RE.test(line)) return 'sprite'
  if (GOTO_RE.test(line)) return 'goto'
  if (MARKER_RE.test(line)) return 'marker'
  if (CHOICE_RE.test(line)) return 'choice'
  if (COMMENT_RE.test(line)) return 'comment'
  if (DIALOGUE_PREFIX_RE.test(line) && DIALOGUE_RE.test(line)) return 'dialogue'
  return 'unknown'
}
