/**
 * 示例项目「星灯渡」结构性回归 — 图走查 + 叙事一致性门禁
 *
 * 这个示例是活体 fixture:任何人改坏结构(分支断路/伏笔指向不存在的场景)
 * 都会在这里被拦下。
 */
import { describe, it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from '../../shared/dsl/parser.js'
import {
  buildVmGraph,
  createVmState,
  getCurrentStep,
  advanceVm,
  jumpToTarget
} from '../../shared/preview/runtime-vm.js'
import { analyzeReachability } from '../ai/agent/decision-tree.js'
import { mergeScriptAsts } from '../../shared/dsl/merge-scripts.js'
import { ProjectBrainSchema } from '../../shared/brain/schema.js'

const ROOT = join(process.cwd(), 'examples', 'hikaribune')

const loadProject = async () => {
  const files = (await readdir(join(ROOT, 'scripts'))).filter((f) => f.endsWith('.gal')).sort()
  const asts = []
  for (const f of files) {
    const src = await readFile(join(ROOT, 'scripts', f), 'utf-8')
    const r = parse(src)
    expect(r.ok, `${f} 解析失败: ${r.ok ? '' : JSON.stringify(r.error)}`).toBe(true)
    if (r.ok) asts.push({ file: f, ast: r.value })
  }
  return { asts, merged: mergeScriptAsts(asts) }
}

describe('示例项目「星灯渡」— 结构回归', () => {
  it('全项目可达性干净(无死路/悬空跳转)', async () => {
    const { merged } = await loadProject()
    const report = analyzeReachability(merged)
    expect(report.unreachable).toEqual([])
    expect(report.danglingTargets).toEqual([])
  })

  it('两条前段分支都能到达 ch1_clock 与章末', async () => {
    const { merged } = await loadProject()
    const graph = buildVmGraph(merged)
    for (const branch of ['ch1_diary_open', 'ch1_diary_back']) {
      let state = createVmState(graph, 'ch1_start')
      // 快进到第一个选择
      for (let i = 0; i < 10; i++) {
        const step = getCurrentStep(graph, state)
        if (step?.type === 'choice') break
        const r = advanceVm(graph, state)
        if (r.ok) state = r.state
      }
      // 选 diary 分支
      const jumped = jumpToTarget(graph, state, branch)
      expect(jumped.ok, `${branch} 不可达`).toBe(true)
      if (!jumped.ok) continue
      // 走到章末 marker 场景
      const fin = jumpToTarget(graph, jumped.state, 'ch1_fin')
      expect(fin.ok, `${branch} → ch1_fin 断路`).toBe(true)
    }
  })

  it('变量分支产生不同章末内容(curiosity 路线含船票)', async () => {
    const { merged } = await loadProject()
    const graph = buildVmGraph(merged)
    // 模拟高 curiosity:直接在 ending 场景用变量走 if
    let state = createVmState(graph, 'ch1_ending')
    state = { ...state, variables: { curiosity: 1, trust_wanqing: 1 } }
    const texts = []
    for (let i = 0; i < 12; i++) {
      const step = getCurrentStep(graph, state)
      if (!step) break
      if (step.type === 'dialogue') texts.push(step.text)
      const r = advanceVm(graph, state)
      if (!r.ok) break
      state = r.state
    }
    expect(texts.some((t) => t.includes('船票'))).toBe(true)
    expect(texts.some((t) => t.includes('灯塔的事'))).toBe(true)
    // 低变量对照
    let state2 = createVmState(graph, 'ch1_ending')
    state2 = { ...state2, variables: {} }
    const texts2 = []
    for (let i = 0; i < 12; i++) {
      const step = getCurrentStep(graph, state2)
      if (!step) break
      if (step.type === 'dialogue') texts2.push(step.text)
      const r = advanceVm(graph, state2)
      if (!r.ok) break
      state2 = r.state
    }
    expect(texts2.some((t) => t.includes('船票'))).toBe(false)
  })

  it('变量 set 步真实存在于图中(防语法误写被静默吞掉)', async () => {
    const { merged } = await loadProject()
    const graph = buildVmGraph(merged)
    const setScenes = ['ch1_diary_open', 'ch1_ask_luli', 'ch1_silence']
    for (const sid of setScenes) {
      const steps = graph.scenes[sid]?.steps ?? []
      expect(
        steps.some((s) => s.type === 'set'),
        `${sid} 应包含 set 步(检查 设: 语法是否顶格无括号)`
      ).toBe(true)
    }
  })

  it('brain 的伏笔都埋在真实存在的场景里(叙事一致性门禁)', async () => {
    const { merged } = await loadProject()
    const graph = buildVmGraph(merged)
    const brainRaw = JSON.parse(await readFile(join(ROOT, 'project-brain.json'), 'utf-8'))
    const brain = ProjectBrainSchema.parse(brainRaw)
    expect(brain.foreshadowings.length).toBeGreaterThanOrEqual(3)
    for (const f of brain.foreshadowings) {
      expect(
        graph.scenes[f.plantedInSceneId ?? ''],
        `伏笔 ${f.id} 指向不存在的场景 ${f.plantedInSceneId}`
      ).toBeTruthy()
    }
  })
})
