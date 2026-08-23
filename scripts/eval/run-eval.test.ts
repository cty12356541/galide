/**
 * run-eval — 真实模型 agent eval 基线(本地手动,不进 CI)
 *
 * 运行: GALIDE_EVAL_PROVIDER=openai|claude GALIDE_EVAL_MODEL=<model> \
 *       OPENAI_API_KEY=... (或 ANTHROPIC_API_KEY=...) pnpm eval:agent [-- --runs N]
 * 未配置凭证时整组跳过。
 *
 * 产物: .omo/eval/report-<timestamp>.json + 控制台摘要表
 */
import { describe, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import {
  readEvalConfig,
  createEvalLlm,
  createEvalGit,
  materializeFixture,
  judgeReachabilityClean,
  judgeSceneExists,
  judgeBrainHasForeshadowing
} from './eval-harness.js'
import { runAgent } from '../../src/main/ai/agent/agent-loop.js'
import { createDefaultToolRegistry } from '../../src/main/ai/agent/create-default-registry.js'
import { createAgentRuntime } from '../../src/main/ai/agent/agent-runtime.js'
import { createAutonomyGate } from '../../src/main/ai/agent/autonomy-gate.js'
import { TOPOLOGIES } from '../../src/main/ai/agent/topology.js'
import { evalNodeFs } from './eval-harness.js'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

type EvalTask = {
  name: string
  fixture: string
  goal: string
  judge: (projectPath: string) => Promise<{ pass: boolean; detail: string }>
}

const TASKS: readonly EvalTask[] = [
  {
    name: 'add-scene',
    fixture: 'add-scene',
    goal:
      '在项目中新增一个场景 finale(新文件或现有文件均可),写入至少两条对白,并让现有剧情通过跳转或选项可以到达 finale。完成后结束。',
    judge: (projectPath) => judgeSceneExists(projectPath, 'finale')()
  },
  {
    name: 'fix-reachability',
    fixture: 'fix-reachability',
    goal:
      '修复剧本中的可达性问题:存在不可达场景与悬空跳转。用 analyze_reachability 检查并修复,使全项目无不可达场景、无悬空跳转。完成后结束。',
    judge: judgeReachabilityClean
  },
  {
    name: 'brain-consistency',
    fixture: 'brain-consistency',
    goal:
      '在场景 rooftop 中续写两条对白,让小雪自然地埋下一个伏笔(与那块怀表有关),然后用 brain_upsert_foreshadowing 把这个伏笔登记到项目大脑。完成后结束。',
    judge: async (projectPath) => {
      const brain = await judgeBrainHasForeshadowing(projectPath)
      if (!brain.pass) return brain
      return judgeReachabilityClean(projectPath)
    }
  }
]

const parseRuns = (): number => {
  const idx = process.argv.indexOf('--runs')
  if (idx >= 0 && process.argv[idx + 1]) return Number(process.argv[idx + 1]) || 5
  return 5
}

type RunRecord = {
  task: string
  run: number
  status: string
  pass: boolean
  detail: string
  steps: number
  llmCalls: number
  promptTokens: number
  completionTokens: number
  durationMs: number
  rollbacks: number
  warnings?: string[]
  error?: string
}

describe('agent eval — 真实模型基线', { timeout: 3_600_000 }, () => {
  const cfg = readEvalConfig()
  describe.skipIf(!cfg)('任务集', () => {
    const config = cfg!
    const runs = parseRuns()
    const records: RunRecord[] = []

    it(`跑完 ${TASKS.length} 个任务 × ${runs} 次`, async () => {
      for (const task of TASKS) {
        for (let i = 1; i <= runs; i++) {
          const projectPath = await materializeFixture(join(FIXTURES_DIR, task.fixture))
          const llm = createEvalLlm(config)
          const git = createEvalGit()
          const runtime = createAgentRuntime({ projectPath })
          const toolContext = runtime.createToolContext({
            fs: evalNodeFs,
            dispatch: async () => ({ ok: false, error: 'eval: no UI' }),
            onProjectOpened: async () => undefined
          })
          const startedAt = Date.now()
          let stepCount = 0
          let lastError: string | undefined
          let warnings: string[] | undefined
          try {
            const result = await runAgent(
              { goal: task.goal, system: '你是 Galide 创作平台的 AI agent。优先使用工具完成目标,完成后用简短中文总结。', messages: [] },
              {
                llm,
                tools: createDefaultToolRegistry(),
                git,
                gate: createAutonomyGate('autonomous'),
                topology: TOPOLOGIES.litePlanExecute,
                toolContext,
                maxSteps: 30,
                maxCriticFix: 1,
                onStep: (s) => {
                  if (s.type !== 'plan' && s.type !== 'plan_progress') stepCount++
                  if (s.type === 'done' && s.warnings) warnings = [...s.warnings]
                }
              }
            )
            if (result.error) lastError = result.error
            const judged = await task.judge(projectPath)
            records.push({
              task: task.name,
              run: i,
              status: result.status,
              pass: judged.pass,
              detail: judged.detail,
              steps: stepCount,
              llmCalls: llm.calls,
              promptTokens: llm.usage.prompt,
              completionTokens: llm.usage.completion,
              durationMs: Date.now() - startedAt,
              rollbacks: git.rollbacks,
              warnings,
              error: lastError
            })
          } catch (e) {
            records.push({
              task: task.name,
              run: i,
              status: 'error',
              pass: false,
              detail: '',
              steps: stepCount,
              llmCalls: llm.calls,
              promptTokens: llm.usage.prompt,
              completionTokens: llm.usage.completion,
              durationMs: Date.now() - startedAt,
              rollbacks: git.rollbacks,
              error: e instanceof Error ? e.message : String(e)
            })
          }
        }
      }

      // 报告
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const summary = TASKS.map((t) => {
        const rs = records.filter((r) => r.task === t.name)
        return {
          task: t.name,
          runs: rs.length,
          passRate: rs.length > 0 ? rs.filter((r) => r.pass).length / rs.length : 0,
          avgSteps: avg(rs.map((r) => r.steps)),
          avgLlmCalls: avg(rs.map((r) => r.llmCalls)),
          totalTokens: rs.reduce((a, r) => a + r.promptTokens + r.completionTokens, 0),
          avgDurationMs: avg(rs.map((r) => r.durationMs)),
          rollbacks: rs.reduce((a, r) => a + r.rollbacks, 0)
        }
      })
      const report = {
        generatedAt: new Date().toISOString(),
        provider: config.provider,
        model: config.model,
        runsPerTask: runs,
        summary,
        records
      }
      const outDir = join(process.cwd(), '.omo', 'eval')
      await mkdir(outDir, { recursive: true })
      const outFile = join(outDir, `report-${stamp}.json`)
      await writeFile(outFile, JSON.stringify(report, null, 2))

      // 控制台摘要
      console.log('\n===== Agent Eval 摘要 =====')
      for (const s of summary) {
        console.log(
          `${s.task}: 成功率 ${(s.passRate * 100).toFixed(0)}% (${s.runs} 次) | 平均步数 ${s.avgSteps.toFixed(1)} | 平均耗时 ${(s.avgDurationMs / 1000).toFixed(1)}s | tokens ${s.totalTokens} | 回滚 ${s.rollbacks}`
        )
      }
      console.log(`报告已写入: ${outFile}\n`)
    })
  })
})

const avg = (xs: number[]): number => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
