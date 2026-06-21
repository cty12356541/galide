/**
 * scan-variables — 扫描 AST 中的 SetNode 变量名与门控/条件表达式
 */
import { walkScript } from './visitor'
import { serializeExpression } from './expression'
import type { ChoiceNode, IfNode, ScriptNode, SetNode } from './types'

export interface GatedChoiceInfo {
  sceneId: string
  text: string
  target: string
  condition: string
}

export interface ConditionalBranchInfo {
  sceneId: string
  kind: 'if' | 'elif' | 'else'
  condition: string
}

export interface ScanVariablesResult {
  setVariables: string[]
  gatedChoices: GatedChoiceInfo[]
  conditionalBranches: ConditionalBranchInfo[]
}

const findSceneId = (ast: ScriptNode, node: { line: number }): string => {
  let sceneId = ''
  walkScript(ast, {
    visitScene: (s) => {
      if (node.line >= s.line) sceneId = s.id
    }
  })
  return sceneId
}

/** 扫描剧本 AST 中所有变量赋值与条件门控 */
export const scanScriptVariables = (ast: ScriptNode): ScanVariablesResult => {
  const setVarSet = new Set<string>()
  const gatedChoices: GatedChoiceInfo[] = []
  const conditionalBranches: ConditionalBranchInfo[] = []

  walkScript(ast, {
    visitSet: (n: SetNode) => {
      setVarSet.add(n.name)
    },
    visitChoice: (n: ChoiceNode) => {
      for (const opt of n.options) {
        if (opt.condition !== undefined) {
          gatedChoices.push({
            sceneId: findSceneId(ast, n),
            text: opt.text,
            target: opt.target,
            condition: serializeExpression(opt.condition)
          })
        }
      }
    },
    visitIf: (n: IfNode) => {
      for (const branch of n.branches) {
        conditionalBranches.push({
          sceneId: findSceneId(ast, n),
          kind: branch.kind,
          condition:
            branch.condition !== undefined ? serializeExpression(branch.condition) : '(else)'
        })
      }
    }
  })

  return {
    setVariables: [...setVarSet].sort(),
    gatedChoices,
    conditionalBranches
  }
}
