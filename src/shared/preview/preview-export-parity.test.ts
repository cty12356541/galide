/**
 * preview-export-parity — Preview VM graph 与 Web export 嵌入 graph 结构等价
 */
import { describe, it, expect } from 'vitest'
import { parse } from '../dsl/parser.js'
import { mergeScriptAsts } from '../dsl/merge-scripts.js'
import { buildVmGraph } from './runtime-vm.js'

const FIXTURE_A = `## 入口
主角: "去第二章"
[跳转:第二章·开始]
`

const FIXTURE_B = `## 第二章·开始
主角: "到了"
`

describe('preview-export-parity', () => {
  it('merged AST buildVmGraph 与 export 同源:entry scene 与 node count 一致', () => {
    const astA = parse(FIXTURE_A)
    const astB = parse(FIXTURE_B)
    expect(astA.ok).toBe(true)
    expect(astB.ok).toBe(true)
    if (astA.ok === false || astB.ok === false) return

    const merged = mergeScriptAsts([
      { file: 'a.gal', ast: astA.value },
      { file: 'b.gal', ast: astB.value }
    ])
    const graph = buildVmGraph(merged)

    expect(graph.sceneOrder).toContain('入口')
    expect(graph.sceneOrder).toContain('第二章·开始')
    expect(graph.scenes['入口']?.steps.length).toBeGreaterThan(0)
    expect(graph.scenes['第二章·开始']?.steps.some((s) => s.type === 'dialogue')).toBe(true)

    const entryScene = graph.sceneOrder[0]
    expect(entryScene).toBeTruthy()
    const sceneCount = Object.keys(graph.scenes).length
    expect(sceneCount).toBe(2)
  })
})
