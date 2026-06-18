/**
 * gal DSL 抽象语法树类型
 * Canonical artifact: .gal 文件解析为 ScriptAST
 *
 * 规约依据: .style-spec/layers/dsl/conventions.yaml:21-22
 *   "Parser 输出 AST,必须包含:nodes(Node[]), errors(ParseError[])"
 *
 * 实现差异:
 *   - children ↔ spec 中的 nodes(命名沿用既存代码;语义一致)
 *   - errors 字段挂在 ScriptNode 上(替代把 errors 仅放在 Result.error)
 *     这样消费者(UI 诊断面板、FlowView 警告徽章等)可以从 AST 直接读取,
 *     无需额外管理 errors 旁路。
 *   - parse() 函数同时返回 Result;若 severity === 'error',ok = false;
 *     若全 warning,ok = true 但 ScriptNode.errors 仍携带警告列表。
 */

export type ScriptNode = BaseNode & {
  type: 'script'
  children: AstNode[]
  errors: ParseError[]
}

export type SceneNode = BaseNode & {
  type: 'scene'
  id: string
  background?: string
  bgm?: string
  children: AstNode[]
}

export type DialogueNode = BaseNode & {
  type: 'dialogue'
  character: string
  sprite?: string
  position?: 'left' | 'right' | 'center'
  lines: string[]
}

export type ChoiceNode = BaseNode & {
  type: 'choice'
  options: ChoiceOption[]
}

export type ChoiceOption = {
  text: string
  target: string
}

export type GotoNode = BaseNode & {
  type: 'goto'
  target: string
}

export type MarkerNode = BaseNode & {
  type: 'marker'
  id: string
}

export type CommentNode = BaseNode & { type: 'comment'; text: string }

export type AstNode =
  | ScriptNode
  | SceneNode
  | DialogueNode
  | ChoiceNode
  | GotoNode
  | MarkerNode
  | CommentNode

export type BaseNode = {
  line: number
  column: number
}

export type TokenType =
  | 'chapter'
  | 'scene'
  | 'background'
  | 'bgm'
  | 'sprite'
  | 'position'
  | 'dialogue'
  | 'choice'
  | 'marker'
  | 'goto'
  | 'comment'
  | 'text'
  | 'quote'
  | 'arrow'
  | 'pipe'
  | 'identifier'
  | 'newline'
  | 'whitespace'
  | 'unknown'

export type Token = {
  type: TokenType
  value: string
  line: number
  column: number
}

export type ParseError = {
  message: string
  line: number
  column: number
  severity: 'error' | 'warning'
}

export type Result<T, E = ParseError[]> =
  | { ok: true; value: T }
  | { ok: false; error: E }
