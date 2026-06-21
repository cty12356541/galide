/**
 * gal DSL 序列化器 — AST → .gal 文本
 *
 * 功能即岛 v2 / 编辑核心区(方案 B):结构化卡片编辑器改 AST 后,
 * 必须能写回 .gal 文本(保存 + 喂给 FlowView/Preview)。
 *
 * 设计:
 *   - 与 lexer.ts(line-rules.ts)的行格式严格对齐,保证 serialize→parse 往返稳定
 *   - sprite/position 为 sticky 语义:仅当相对上一条对白变化时才发立绘舞台行,
 *     复原 .gal 的「持续到下次改变」写法(与 parser pending 语义对偶)
 *   - 已知边界(parser 不入 AST):chapter 行 / 注释行 在往返中丢失,属可接受取舍
 *
 * 规约依据: .style-spec/layers/dsl/conventions.yaml(line_types)
 */
import type {
  AstNode,
  DialogueNode,
  GotoNode,
  IfNode,
  MarkerNode,
  SceneNode,
  ScriptNode,
  SetNode
} from './types.js'
import { serializeExpression } from './expression.js'

type SpriteState = { sprite: string | undefined; position: 'left' | 'right' | 'center' | undefined }

const POSITION_LABEL: Record<NonNullable<SpriteState['position']>, string> = {
  left: 'left',
  right: 'right',
  center: 'center'
}

/** 序列化单条对白:`角色: "文本"` */
const dialogueLine = (node: DialogueNode): string => `${node.character}: "${node.lines[0] ?? ''}"`

/**
 * 立绘舞台行:仅当 sprite/position 相对上一条对白变化时发出。
 * `[角色:NAME | 立绘:SPRITE | 位置:POS]`(缺省部分省略)
 */
const spriteStageLine = (node: DialogueNode, last: SpriteState): string | null => {
  const parts: string[] = [`角色:${node.character}`]
  if (node.sprite) parts.push(`立绘:${node.sprite}`)
  if (node.position) parts.push(`位置:${POSITION_LABEL[node.position]}`)
  const changed =
    node.sprite !== last.sprite || node.position !== last.position
  if (!changed) return null
  return `[${parts.join(' | ')}]`
}

/** 选项行:`* "文本" -> 目标 [当: expr]` */
const choiceLine = (text: string, target: string, condition?: import('./types.js').ChoiceOption['condition']): string => {
  const cond = condition !== undefined ? ` [当: ${serializeExpression(condition)}]` : ''
  return target ? `* "${text}" -> ${target}${cond}` : `* "${text}"${cond}`
}

const SET_OP_LABEL: Record<SetNode['op'], string> = {
  set: '=',
  add: '+=',
  sub: '-='
}

const setLine = (node: SetNode): string =>
  `设: ${node.name} ${SET_OP_LABEL[node.op]} ${serializeExpression(node.value)}`

const ifBlockLines = (node: IfNode, sprite: SpriteState, out: string[]): SpriteState => {
  for (const branch of node.branches) {
    if (branch.kind === 'if') {
      out.push(`[若: ${branch.condition ? serializeExpression(branch.condition) : 'true'}]`)
    } else if (branch.kind === 'elif') {
      out.push(`[否则若: ${branch.condition ? serializeExpression(branch.condition) : 'true'}]`)
    } else {
      out.push('[否则]')
    }
    for (const child of branch.children) {
      sprite = serializeChild(child, sprite, out)
    }
  }
  out.push('[若终]')
  return sprite
}

/** 序列化一个场景块(含其 children),维护 sticky sprite 状态 */
const serializeScene = (scene: SceneNode, sprite: SpriteState, out: string[]): SpriteState => {
  out.push(`## ${scene.id}`)
  if (scene.background !== undefined) out.push(`背景: ${scene.background}`)
  if (scene.bgm !== undefined) out.push(`BGM: ${scene.bgm}`)
  for (const child of scene.children) {
    const next = serializeChild(child, sprite, out)
    sprite = next
  }
  return sprite
}

/** 序列化 scene 内 / root 平铺层的单个子节点,返回更新后的 sprite 状态 */
const serializeChild = (
  node: AstNode,
  sprite: SpriteState,
  out: string[]
): SpriteState => {
  switch (node.type) {
    case 'dialogue': {
      const stage = spriteStageLine(node, sprite)
      if (stage) out.push(stage)
      out.push(dialogueLine(node))
      return { sprite: node.sprite, position: node.position }
    }
    case 'choice': {
      for (const opt of node.options) out.push(choiceLine(opt.text, opt.target, opt.condition))
      return sprite
    }
    case 'set': {
      out.push(setLine(node as SetNode))
      return sprite
    }
    case 'if': {
      return ifBlockLines(node as IfNode, sprite, out)
    }
    case 'goto': {
      out.push(`[跳转:${(node as GotoNode).target}]`)
      return sprite
    }
    case 'marker': {
      out.push(`=== ${(node as MarkerNode).id} ===`)
      return sprite
    }
    case 'comment':
      return sprite
    default:
      return sprite
  }
}

/**
 * 序列化整棵 Script AST 为 .gal 文本。
 * root.children 按 DFS 序输出:scene 块整体展开,非 scene 节点平铺内联。
 * 场景间以空行分隔,末尾保留换行。
 */
export const serialize = (ast: ScriptNode): string => {
  let sprite: SpriteState = { sprite: undefined, position: undefined }
  const blocks: string[][] = []
  let current: string[] = []

  for (const child of ast.children) {
    if (child.type === 'scene') {
      if (current.length) blocks.push(current)
      current = []
      sprite = serializeScene(child, sprite, current)
    } else {
      sprite = serializeChild(child, sprite, current)
    }
  }
  if (current.length) blocks.push(current)

  // 场景块之间空行分隔,块内紧凑(对白/选项紧邻,符合 parser 读取习惯)
  return blocks.map((b) => b.join('\n')).join('\n\n') + '\n'
}
