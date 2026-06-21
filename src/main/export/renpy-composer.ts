/**
 * Ren'Py Composer — gal AST → .rpy 脚本
 *
 * 目标格式: game/script.rpy + game/characters.rpy
 * 参考: https://www.renpy.org/doc/html/
 */

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Composer, ExportContext, MultiFileOutput } from './composer.js'
import type {
  AstNode,
  DialogueNode,
  SceneNode,
  ScriptNode
} from '../../shared/dsl/types.js'
import { collectNodes, walkScript } from '../../shared/dsl/visitor.js'
import { emitRenpyExpression } from './expression-to-renpy.js'

const INDENT = '    '

export interface RenpyAst {
  readonly scriptLines: readonly string[]
  readonly characters: readonly string[]
}

/** 将 gal 标识符转为 Ren'Py label 名(保留 CJK,替换标点) */
export const sanitizeRenpyLabel = (id: string): string => {
  const cleaned = id
    .replace(/[·\s-]+/g, '_')
    .replace(/[^\w\u4e00-\u9fff]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!cleaned) return 'unnamed'
  if (/^[0-9]/.test(cleaned)) return `n_${cleaned}`
  return cleaned
}

const escapeRenpyString = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

const indentLine = (level: number, line: string): string => INDENT.repeat(level) + line

const resolveLabel = (id: string, labelMap: ReadonlyMap<string, string>): string =>
  labelMap.get(id) ?? sanitizeRenpyLabel(id)

/** 收集 scene/marker/choice/goto 目标,建立 gal id → Ren'Py label 映射 */
export const buildLabelMap = (scripts: readonly ScriptNode[]): Map<string, string> => {
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
    const label = sanitizeRenpyLabel(id)
    let candidate = label
    let n = 2
    while (used.has(candidate)) {
      candidate = `${label}_${n}`
      n++
    }
    used.add(candidate)
    map.set(id, candidate)
  }
  return map
}

const collectCharacters = (scripts: readonly ScriptNode[]): string[] => {
  const names = new Set<string>()
  for (const script of scripts) {
    walkScript(script, {
      visitDialogue: (n: DialogueNode) => {
        if (n.character) names.add(n.character)
      }
    })
  }
  return Array.from(names).sort()
}

const toCharacterVar = (displayName: string): string => {
  const base = sanitizeRenpyLabel(displayName)
  return `char_${base}`
}

const emitNodes = (
  nodes: readonly AstNode[],
  level: number,
  labelMap: ReadonlyMap<string, string>,
  lines: string[]
): void => {
  for (const node of nodes) {
    switch (node.type) {
      case 'dialogue':
        for (const text of node.lines) {
          lines.push(
            indentLine(
              level,
              `"${escapeRenpyString(node.character)}" "${escapeRenpyString(text)}"`
            )
          )
        }
        if (node.sprite) {
          const pos = node.position ? ` at ${node.position}` : ''
          lines.push(indentLine(level, `# show sprite: ${node.sprite}${pos}`))
        }
        break
      case 'set': {
        const val = emitRenpyExpression(node.value)
        const op = node.op === 'set' ? '=' : node.op === 'add' ? '+=' : '-='
        lines.push(indentLine(level, `$ ${node.name} ${op} ${val}`))
        break
      }
      case 'if':
        for (const branch of node.branches) {
          if (branch.kind === 'if') {
            lines.push(
              indentLine(level, `if ${emitRenpyExpression(branch.condition!)}:`)
            )
          } else if (branch.kind === 'elif') {
            lines.push(
              indentLine(level, `elif ${emitRenpyExpression(branch.condition!)}:`)
            )
          } else {
            lines.push(indentLine(level, 'else:'))
          }
          emitNodes(branch.children, level + 1, labelMap, lines)
        }
        break
      case 'choice':
        lines.push(indentLine(level, 'menu:'))
        for (const opt of node.options) {
          const target = resolveLabel(opt.target, labelMap)
          const cond = opt.condition
            ? ` if ${emitRenpyExpression(opt.condition)}`
            : ''
          lines.push(
            indentLine(level + 1, `"${escapeRenpyString(opt.text)}"${cond}:`)
          )
          lines.push(indentLine(level + 2, `jump ${target}`))
        }
        break
      case 'goto':
        lines.push(indentLine(level, `jump ${resolveLabel(node.target, labelMap)}`))
        break
      case 'marker':
        lines.push(`label ${resolveLabel(node.id, labelMap)}:`)
        break
      case 'comment':
        lines.push(indentLine(level, `# ${node.text}`))
        break
      default:
        break
    }
  }
}

const emitScene = (
  scene: SceneNode,
  labelMap: ReadonlyMap<string, string>,
  lines: string[]
): void => {
  const label = resolveLabel(scene.id, labelMap)
  lines.push(`label ${label}:`)
  if (scene.background) {
    lines.push(
      indentLine(1, `scene expression "${escapeRenpyString(scene.background)}"`)
    )
  }
  if (scene.bgm) {
    lines.push(indentLine(1, `play music "${escapeRenpyString(scene.bgm)}"`))
  }
  emitNodes(scene.children, 1, labelMap, lines)
  lines.push('')
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

const buildScriptLines = (
  merged: ScriptNode,
  labelMap: ReadonlyMap<string, string>
): string[] => {
  const lines: string[] = [
    '# Generated by Galide — Ren\'Py export',
    '# Regenerate from .gal sources; do not edit by hand.',
    ''
  ]

  const scenes = merged.children.filter((n): n is SceneNode => n.type === 'scene')
  if (scenes.length > 0) {
    const firstLabel = resolveLabel(scenes[0]!.id, labelMap)
    lines.push('label start:')
    lines.push(indentLine(1, `jump ${firstLabel}`))
    lines.push('')
  }

  for (const scene of scenes) {
    emitScene(scene, labelMap, lines)
  }

  return lines
}

const buildCharactersRpy = (characters: readonly string[]): string => {
  if (characters.length === 0) return '# No characters\n'
  const lines = ['# Generated by Galide — character definitions', '']
  for (const name of characters) {
    const varName = toCharacterVar(name)
    lines.push(`define ${varName} = Character("${escapeRenpyString(name)}")`)
  }
  lines.push('')
  return lines.join('\n')
}

export class RenpyComposer implements Composer<RenpyAst, MultiFileOutput> {
  readonly name = 'renpy' as const
  readonly defaultFilename = 'game/script.rpy'

  async transform(ctx: ExportContext): Promise<RenpyAst> {
    const merged = mergeScripts(ctx.asts)
    const scripts = ctx.asts.map((e) => e.ast)
    const labelMap = buildLabelMap(scripts.length > 0 ? scripts : [merged])
    const scriptLines = buildScriptLines(merged, labelMap)
    const characters = collectCharacters(scripts.length > 0 ? scripts : [merged])

    const assetsSrc = join(ctx.request.projectPath, 'assets')
    const assetsDest = join(ctx.outputDir, 'game', 'assets')
    try {
      await fs.mkdir(join(ctx.outputDir, 'game'), { recursive: true })
      await fs.cp(assetsSrc, assetsDest, { recursive: true })
    } catch (err) {
      console.warn(`[galide export] Ren'Py assets 复制失败: ${assetsSrc}`, err)
    }

    return { scriptLines, characters }
  }

  emit(target: RenpyAst, _ctx: ExportContext): MultiFileOutput {
    return {
      kind: 'multi',
      files: [
        {
          path: 'game/script.rpy',
          content: [...target.scriptLines].join('\n')
        },
        {
          path: 'game/characters.rpy',
          content: buildCharactersRpy(target.characters)
        }
      ]
    }
  }
}
