/**
 * Ink Composer — gal AST → story.ink
 *
 * 目标格式: 单文件 .ink (knot/stitch + VAR + 条件块)
 * 参考: https://github.com/inkle/ink
 */

import type { Composer, ExportContext } from './composer.js'
import { mergeScriptAsts } from '../../shared/dsl/merge-scripts.js'
import {
  buildUniqueIdMap,
  collectJumpTargetIds,
  loadManifestCharacters,
  sanitizeExportId,
  type ManifestCharacter
} from './shared.js'
import type {
  AstNode,
  DialogueNode,
  Expression,
  SceneNode,
  ScriptNode
} from '../../shared/dsl/types.js'
import { walkScript } from '../../shared/dsl/visitor.js'
import { emitInkExpression } from './expression-to-ink.js'

const INDENT = '    '

export interface InkAst {
  readonly lines: readonly string[]
}

/** 将 gal 标识符转为 Ink knot 名(保留 CJK,替换标点/空格) */
export const sanitizeInkKnot = (id: string): string => sanitizeExportId(id, 'k')

const indentLine = (level: number, line: string): string => INDENT.repeat(level) + line

const resolveKnot = (id: string, knotMap: ReadonlyMap<string, string>): string =>
  knotMap.get(id) ?? sanitizeInkKnot(id)

/** 收集 scene/marker/choice/goto 目标,建立 gal id → Ink knot 映射 */
export const buildKnotMap = (scripts: readonly ScriptNode[]): Map<string, string> =>
  buildUniqueIdMap(collectJumpTargetIds(scripts), sanitizeInkKnot)

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
  if (node.sprite) {
    const posArg = node.position ? `"${node.position}"` : '""'
    lines.push(
      indentLine(level, `~ showCharacter("${node.character}", "${node.sprite}", ${posArg})`)
    )
  }
  for (const text of node.lines) {
    if (node.character && node.character !== '旁白') {
      lines.push(indentLine(level, `${node.character}: ${text}`))
    } else {
      lines.push(indentLine(level, text))
    }
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
      case 'chapter':
        lines.push(indentLine(level, `// chapter: ${node.title}`))
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

const buildInkLines = (
  merged: ScriptNode,
  knotMap: ReadonlyMap<string, string>,
  variables: ReadonlyMap<string, VarInfo>,
  spriteDeclLines: readonly string[]
): string[] => {
  const lines: string[] = [
    '// Generated by Galide — Ink export',
    '// Regenerate from .gal sources; do not edit by hand.',
    '// Runtime: bind EXTERNAL showCharacter(name, state, position) in Unity/Ink.',
    'EXTERNAL showCharacter(name, state, position)',
    ''
  ]

  if (spriteDeclLines.length > 0) {
    lines.push('// Sprite registry (.galproj spriteSet):')
    lines.push(...spriteDeclLines)
    lines.push('')
  }

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

export const buildInkSpriteDeclLines = (manifestChars: readonly ManifestCharacter[]): string[] => {
  const lines: string[] = []
  for (const char of manifestChars) {
    for (const sprite of char.spriteSet ?? []) {
      if (!sprite.path) continue
      const state = sanitizeInkKnot(sprite.state || 'default')
      lines.push(`// IMAGE: ${char.name}/${state} -> ${sprite.path}`)
    }
  }
  if (lines.length === 0) {
    lines.push('// (no sprite images in .galproj)')
  }
  return lines
}

export class InkComposer implements Composer<InkAst, string> {
  readonly name = 'ink' as const
  readonly defaultFilename = 'story.ink'

  async transform(ctx: ExportContext): Promise<InkAst> {
    const merged = mergeScriptAsts(ctx.asts)
    const scripts = ctx.asts.map((e) => e.ast)
    const source = scripts.length > 0 ? scripts : [merged]
    const knotMap = buildKnotMap(source)
    const variables = collectInkVariables(source)
    const manifestChars = await loadManifestCharacters(ctx.request.projectPath)
    const spriteDeclLines = buildInkSpriteDeclLines(manifestChars)
    const lines = buildInkLines(merged, knotMap, variables, spriteDeclLines)
    return { lines }
  }

  emit(target: InkAst, _ctx: ExportContext): string {
    return [...target.lines].join('\n')
  }
}
