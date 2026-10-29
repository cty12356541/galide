/**
 * Galide 性能基准套件核心实现 (v0.7 T0-3 & T2-3)
 *
 * 覆盖四项核心指标:
 *   1. parse10kLines          — 万行 .gal parse + 诊断耗时
 *   2. vmAdvance1000Steps     — runtime-vm 连续推进 1000 节点耗时
 *   3. webExportMediumProject — Web 导出耗时(中型多文件项目)
 *   4. mergedAst10x1000Lines  — merged AST 构建耗时(10 文件 × 1000 行)
 */
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { parse } from '../../src/shared/dsl/parser.js'
import { mergeScriptAsts } from '../../src/shared/dsl/merge-scripts.js'
import {
  advanceVm,
  buildVmGraph,
  createVmState,
  executeGotoStep,
  getCurrentStep
} from '../../src/shared/preview/runtime-vm.js'
import { parseProjectScripts } from '../../src/main/export/parse-project-scripts.js'
import { WebComposer } from '../../src/main/export/web-composer.js'
import { runComposer } from '../../src/main/export/composer.js'
import {
  BENCH_DEFAULT_SEED,
  generateGalScriptByLines,
  generateMultiFileFixtures,
  generateVmTimelineScript
} from './fixtures.js'

export interface BenchmarkMetric {
  name: string
  unit: 'ms'
  iterations: number
  p50: number
  p95: number
  mean: number
  min: number
  max: number
  meta?: Record<string, number | string>
}

export interface BenchmarkReport {
  schemaVersion: 1
  generatedAt: string
  nodeVersion: string
  platform: string
  arch: string
  seed: number
  benchmarks: {
    parse10kLines: BenchmarkMetric
    vmAdvance1000Steps: BenchmarkMetric
    webExportMediumProject: BenchmarkMetric
    mergedAst10x1000Lines: BenchmarkMetric
  }
}

export interface BenchmarkComparisonRow {
  key: keyof BenchmarkReport['benchmarks']
  baselineP50: number
  currentP50: number
  deltaP50Pct: number
  baselineP95: number
  currentP95: number
  deltaP95Pct: number
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000

const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx] ?? 0
}

const summarizeSamples = (
  name: string,
  samples: readonly number[],
  meta?: Record<string, number | string>
): BenchmarkMetric => {
  const sorted = [...samples].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)
  return {
    name,
    unit: 'ms',
    iterations: sorted.length,
    p50: round3(percentile(sorted, 50)),
    p95: round3(percentile(sorted, 95)),
    mean: round3(sorted.length > 0 ? sum / sorted.length : 0),
    min: round3(sorted[0] ?? 0),
    max: round3(sorted[sorted.length - 1] ?? 0),
    ...(meta ? { meta } : {})
  }
}

const measureSync = (
  name: string,
  iterations: number,
  warmup: number,
  fn: () => void,
  meta?: Record<string, number | string>
): BenchmarkMetric => {
  for (let i = 0; i < warmup; i++) fn()
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    samples.push(performance.now() - t0)
  }
  return summarizeSamples(name, samples, meta)
}

const measureAsync = async (
  name: string,
  iterations: number,
  warmup: number,
  fn: () => Promise<void>,
  meta?: Record<string, number | string>
): Promise<BenchmarkMetric> => {
  for (let i = 0; i < warmup; i++) await fn()
  const samples: number[] = []
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    await fn()
    samples.push(performance.now() - t0)
  }
  return summarizeSamples(name, samples, meta)
}

export const runBenchmarkSuite = async (opts?: {
  iterations?: number
  warmup?: number
  seed?: number
}): Promise<BenchmarkReport> => {
  const iterations = opts?.iterations ?? 15
  const warmup = opts?.warmup ?? 2
  const seed = opts?.seed ?? BENCH_DEFAULT_SEED

  // 1. 万行 .gal parse + 诊断耗时
  const largeGal = generateGalScriptByLines(10_000, seed, 'large_sc')
  let parsedScenes = 0
  const parse10kLines = measureSync(
    '万行 .gal parse + 诊断',
    iterations,
    warmup,
    () => {
      const r = parse(largeGal.source)
      if (!r.ok) {
        throw new Error(`10k benchmark fixture failed to parse: ${r.error[0]?.message}`)
      }
      parsedScenes = r.value.children.length
    },
    { lineCount: largeGal.lineCount, topLevelNodes: parsedScenes }
  )
  parse10kLines.meta = { lineCount: largeGal.lineCount, topLevelNodes: parsedScenes }

  // 2. runtime-vm 推进 1000 节点耗时
  const vmGalSource = generateVmTimelineScript(1_400, seed + 1)
  const vmParsed = parse(vmGalSource)
  if (!vmParsed.ok) {
    throw new Error(`VM benchmark fixture failed to parse: ${vmParsed.error[0]?.message}`)
  }
  const vmGraph = buildVmGraph(vmParsed.value)
  let actualSteps = 0
  const vmAdvance1000Steps = measureSync(
    'runtime-vm 推进 1000 节点',
    iterations,
    warmup,
    () => {
      let state = createVmState(vmGraph)
      let count = 0
      while (count < 1000) {
        const step = getCurrentStep(vmGraph, state)
        if (!step) break
        if (step.type === 'goto') {
          const jumped = executeGotoStep(vmGraph, state, step)
          if (!jumped.ok) throw new Error(jumped.error)
          state = jumped.state
        } else {
          const next = advanceVm(vmGraph, state)
          if (!next.ok) throw new Error(next.error)
          state = next.state
        }
        count++
      }
      if (count < 1000) {
        throw new Error(`VM fixture ended early at step ${count}`)
      }
      actualSteps = count
    },
    { stepsAdvanced: 1000 }
  )
  vmAdvance1000Steps.meta = { stepsAdvanced: actualSteps }

  // 准备多文件内存与临时目录供 #3 (Web 导出) 与 #4 (10x1000 merged AST) 使用
  const tenFiles = generateMultiFileFixtures(10, 1_000, seed + 2)
  const fileNames = Object.keys(tenFiles).sort()
  const memFs = {
    readdir: async (_dir: string): Promise<string[]> => fileNames,
    readFile: async (fullPath: string): Promise<string> => {
      const name = fullPath.split(/[\\/]/).pop() ?? ''
      const content = tenFiles[name]
      if (content === undefined) throw new Error(`Missing fixture file: ${name}`)
      return content
    }
  }

  // 4. merged AST 构建耗时 (10 文件 × 1000 行,无缓存冷解析+合并)
  let mergedSceneCount = 0
  const mergedAst10x1000Lines = await measureAsync(
    'merged AST 构建 (10×1000 行)',
    iterations,
    warmup,
    async () => {
      const { asts, failures } = await parseProjectScripts('/virtual/scripts', memFs)
      if (failures.length > 0) {
        throw new Error(`Merged AST fixture parse failed: ${failures[0]?.file}`)
      }
      const merged = mergeScriptAsts(asts)
      mergedSceneCount = merged.children.length
    }
  )
  mergedAst10x1000Lines.meta = { files: fileNames.length, mergedNodes: mergedSceneCount }

  // 3. Web 导出耗时 (中型项目: 5 文件 × 1000 行 + 真实临时目录写盘)
  const tmpRoot = await mkdtemp(join(tmpdir(), 'galide-bench-web-'))
  try {
    const projectDir = join(tmpRoot, 'project')
    const scriptsDir = join(projectDir, 'scripts')
    const assetsDir = join(projectDir, 'assets')
    const outDir = join(tmpRoot, 'out')
    await mkdir(scriptsDir, { recursive: true })
    await mkdir(assetsDir, { recursive: true })
    await writeFile(join(assetsDir, 'placeholder.txt'), 'bench-asset', 'utf-8')

    const mediumNames = fileNames.slice(0, 5)
    for (const name of mediumNames) {
      await writeFile(join(scriptsDir, name), tenFiles[name] ?? '', 'utf-8')
    }
    const preParsed = await parseProjectScripts(scriptsDir, {
      readdir: async () => mediumNames,
      readFile: async (p) => {
        const n = p.split(/[\\/]/).pop() ?? ''
        return tenFiles[n] ?? ''
      }
    })
    const composer = new WebComposer()

    const webExportMediumProject = await measureAsync(
      'Web 导出 (中型项目 5×1000 行)',
      iterations,
      warmup,
      async () => {
        await mkdir(outDir, { recursive: true })
        await runComposer(composer, {
          request: { projectPath: projectDir, target: 'web', outputPath: outDir },
          asts: preParsed.asts,
          outputDir: outDir,
          progress: () => undefined
        })
      },
      { files: mediumNames.length }
    )

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      seed,
      benchmarks: {
        parse10kLines,
        vmAdvance1000Steps,
        webExportMediumProject,
        mergedAst10x1000Lines
      }
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true })
  }
}

export const compareBenchmarkReports = (
  baseline: BenchmarkReport,
  current: BenchmarkReport
): BenchmarkComparisonRow[] => {
  const keys: (keyof BenchmarkReport['benchmarks'])[] = [
    'parse10kLines',
    'vmAdvance1000Steps',
    'webExportMediumProject',
    'mergedAst10x1000Lines'
  ]
  return keys.map((key) => {
    const b = baseline.benchmarks[key]
    const c = current.benchmarks[key]
    const deltaP50Pct = b.p50 > 0 ? round3(((c.p50 - b.p50) / b.p50) * 100) : 0
    const deltaP95Pct = b.p95 > 0 ? round3(((c.p95 - b.p95) / b.p95) * 100) : 0
    return {
      key,
      baselineP50: b.p50,
      currentP50: c.p50,
      deltaP50Pct,
      baselineP95: b.p95,
      currentP95: c.p95,
      deltaP95Pct
    }
  })
}
