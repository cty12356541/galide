/**
 * Ink Composer — gal AST → story.ink
 *
 * 目标格式: 单文件 .ink (knot/stitch + VAR + 条件块)
 * 参考: https://github.com/inkle/ink
 */

import type { Composer, ExportContext } from './composer.js'
import type {
  AstNode,
  DialogueNode,
  Expression,
  SceneNode,
  ScriptNode
} from '../../shared/dsl/types.js'
import { collectNodes, walkScript } from '../../shared/dsl/visitor.js'
import { emitInkExpression } from './expression-to-ink.js'

const INDENT = '    '

export interface InkAst {
  readonly lines: readonly string[]
}

/** 将 gal 标识符转为 Ink knot 名(保留 CJK,替换标点/空格) */
export const sanitizeInkKnot = (id: string): string => {
  const cleaned = id
    .replace(/[·\s-]+/g, '_')
    .replace(/[^\w\u4e00-\u9fff]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!cleaned) return 'unnamed'
  if (/^[0-9]/.test(cleaned)) return `k_${cleaned}`
  return cleaned
}

const indentLine = (level: number, line: string): string => INDENT.repeat(level) + line

const resolveKnot = (id: string, knotMap: ReadonlyMap<string, string>): string =>
  knotMap.get(id) ?? sanitizeInkKnot(id)

/** 收集 scene/marker/choice/goto 目标,建立 gal id → Ink knot 映射 */
export const buildKnotMap = (scripts: readonly ScriptNode[]): Map<string, string> => {
  const ids = new Set<string>()
  for (const script of scripts) {
    for (const scene of collectNodes(script, (n): n is SceneNode => n.type === 'scene')) {
      ids.add(scene.id)
    }
    for (const marker of collectNodes(script, (n) => n.type === 'marker')) {
      if (marker.type === 'marker') ids.add(marker.id)
    }
    for (const choice of collectNodes(script, (n) => n.type === 'choice')) {
      if (choice.type === 'choice') {
        for (const opt of choice.options) {
          if (opt.target) ids.add(opt.target)
        }
      }
    }
    for (const goto of collectNodes(script, (n) => n.type === 'goto')) {
      if (goto.type === 'goto') ids.add(goto.target)
    }
  }

  const map = new Map<string, string>()
  const used = new Set<string>()
  for (const id of ids) {
    const knot = sanitizeInkKnot(id)
    let candidate = knot
    let n = 2
    while (used.has(candidate)) {
      candidate = `${knot}_${n}`
      n++
    }
    used.add(candidate)
    map.set(id, candidate)
  }
  return map
}

interface VarInfo {
  readonly kind: 'number' | 'boolean' | 'string'
}

const inferVarKind = (expr: Expression): VarInfo['kind'] => {
  if (expr.kind === 'literal') {
    if (typeof expr.value === 'boolean') return 'boolean'
    if (typeof expr.value === 'string') return 'string'
  }
  return 'number'
}

const defaultVarInit = (kind: VarInfo['kind']): string => {
  switch (kind) {
    case 'boolean':
      return 'false'
    case 'string':
      return '""'
    default:
      return '0'
  }
}

/** 扫描 set 节点,收集变量名及推断类型(首次 set 赋值) */
export const collectInkVariables = (scripts: readonly ScriptNode[]): Map<string, VarInfo> => {
  const vars = new Map<string, VarInfo>()
  for (const script of scripts) {
    walkScript(script, {
      visitSet: (node) => {
        if (node.op !== 'set' || vars.has(node.name)) return
        vars.set(node.name, { kind: inferVarKind(node.value) })
      }
    })
  }
  return vars
}

const emitDialogue = (node: DialogueNode, level: number, lines: string[]): void => {
  for (const text of node.lines) {
    if (node.character && node.character !== '旁白') {
      lines.push(indentLine(level, `${node.character}: ${text}`))
    } else {
      lines.push(indentLine(level, text))
    }
  }
  if (node.sprite) {
    const pos = node.position ? ` position:${node.position}` : ''
    lines.push(indentLine(level, `// sprite: ${node.sprite}${pos}`))
  }
}

const emitNodes = (
  nodes: readonly AstNode[],
  level: number,
  knotMap: ReadonlyMap<string, string>,
  lines: string[]
): void => {
  for (const node of nodes) {
    switch (node.type) {
      case 'dialogue':
        emitDialogue(node, level, lines)
        break
      case 'set': {
        const val = emitInkExpression(node.value)
        const op = node.op === 'set' ? '=' : node.op === 'add' ? '+=' : '-='
        lines.push(indentLine(level, `~ ${node.name} ${op} ${val}`))
        break
      }
      case 'if': {
        lines.push(indentLine(level, '{'))
        for (const branch of node.branches) {
          if (branch.kind === 'else') {
            lines.push(indentLine(level + 1, '- else:'))
          } else {
            lines.push(
              indentLine(level + 1, `- ${emitInkExpression(branch.condition!)}:`)
            )
          }
          emitNodes(branch.children, level + 2, knotMap, lines)
        }
        lines.push(indentLine(level, '}'))
        break
      }
      case 'choice':
        for (const opt of node.options) {
          const target = resolveKnot(opt.target, knotMap)
          const cond = opt.condition
            ? `{${emitInkExpression(opt.condition)}} `
            : ''
          lines.push(indentLine(level, `* ${cond}[${opt.text}]`))
          lines.push(indentLine(level + 1, `-> ${target}`))
        }
        break
      case 'goto':
        lines.push(indentLine(level, `-> ${resolveKnot(node.target, knotMap)}`))
        break
      case 'marker':
        lines.push(indentLine(level, `-> ${resolveKnot(node.id, knotMap)}`))
        break
      case 'comment':
        lines.push(indentLine(level, `// ${node.text}`))
        break
      default:
        break
    }
  }
}

interface KnotBlock {
  readonly name: string
  readonly nodes: readonly AstNode[]
}

/** 按 marker 切分 scene 子节点为多个 knot 块 */
const splitSceneAtMarkers = (
  sceneId: string,
  children: readonly AstNode[],
  knotMap: ReadonlyMap<string, string>
): KnotBlock[] => {
  const blocks: KnotBlock[] = []
  let currentName = resolveKnot(sceneId, knotMap)
  let currentNodes: AstNode[] = []

  const flush = (): void => {
    if (currentNodes.length > 0) {
      blocks.push({ name: currentName, nodes: currentNodes })
      currentNodes = []
    }
  }

  for (const child of children) {
    if (child.type === 'marker') {
      flush()
      currentName = resolveKnot(child.id, knotMap)
    } else {
      currentNodes.push(child)
    }
  }
  flush()
  return blocks
}

const emitKnot = (
  name: string,
  nodes: readonly AstNode[],
  knotMap: ReadonlyMap<string, string>,
  lines: string[]
): void => {
  lines.push(`=== ${name} ===`)
  emitNodes(nodes, 0, knotMap, lines)
  lines.push('')
}

const emitScene = (
  scene: SceneNode,
  knotMap: ReadonlyMap<string, string>,
  lines: string[]
): void => {
  if (scene.background) {
    lines.push(`// background: ${scene.background}`)
  }
  if (scene.bgm) {
    lines.push(`// bgm: ${scene.bgm}`)
  }

  const blocks = splitSceneAtMarkers(scene.id, scene.children, knotMap)
  for (const block of blocks) {
    emitKnot(block.name, block.nodes, knotMap, lines)
  }
}

const mergeScripts = (asts: ExportContext['asts']): ScriptNode => {
  const merged: ScriptNode = { type: 'script', line: 1, column: 1, children: [], errors: [] }
  for (const entry of asts) {
    for (const child of entry.ast.children) {
      if (child.type === 'scene') {
        const existing = merged.children.findIndex(
          (c) => c.type === 'scene' && (c as SceneNode).id === child.id
        )
        if (existing >= 0) {
          merged.children[existing] = child
        } else {
          merged.children.push(child)
        }
      } else {
        merged.children.push(child)
      }
    }
  }
  return merged
}

const buildInkLines = (
  merged: ScriptNode,
  knotMap: ReadonlyMap<string, string>,
  variables: ReadonlyMap<string, VarInfo>
): string[] => {
  const lines: string[] = [
    '// Generated by Galide — Ink export',
    '// Regenerate from .gal sources; do not edit by hand.',
    ''
  ]

  if (variables.size > 0) {
    for (const [name, info] of [...variables.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`VAR ${name} = ${defaultVarInit(info.kind)}`)
    }
    lines.push('')
  }

  const scenes = merged.children.filter((n): n is SceneNode => n.type === 'scene')
  if (scenes.length > 0) {
    const firstKnot = resolveKnot(scenes[0]!.id, knotMap)
    lines.push(`-> ${firstKnot}`)
    lines.push('')
  }

  for (const scene of scenes) {
    emitScene(scene, knotMap, lines)
  }

  return lines
}

export class InkComposer implements Composer<InkAst, string> {
  readonly name = 'ink' as const
  readonly defaultFilename = 'story.ink'

  transform(ctx: ExportContext): InkAst {
    const merged = mergeScripts(ctx.asts)
    const scripts = ctx.asts.map((e) => e.ast)
    const source = scripts.length > 0 ? scripts : [merged]
    const knotMap = buildKnotMap(source)
    const variables = collectInkVariables(source)
    const lines = buildInkLines(merged, knotMap, variables)
    return { lines }
  }

  emit(target: InkAst, _ctx: ExportContext): string {
    return [...target.lines].join('\n')
  }
}
