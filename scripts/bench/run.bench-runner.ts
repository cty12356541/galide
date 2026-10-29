import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareBenchmarkReports,
  runBenchmarkSuite,
  type BenchmarkReport
} from './bench-suite.js'

describe('Galide performance benchmark suite', () => {
  it('runs all 4 benchmarks deterministically and writes JSON report', async () => {
    const outRel = process.env['GALIDE_BENCH_OUT'] ?? '.omo/bench/baseline.json'
    const compareRel = process.env['GALIDE_BENCH_COMPARE']
    const maxVmRegressionPct = Number(process.env['GALIDE_BENCH_MAX_VM_REGRESSION_PCT'] ?? '20')
    const iterations = Number(process.env['GALIDE_BENCH_ITERS'] ?? '15')

    const report = await runBenchmarkSuite({ iterations, warmup: 3 })

    for (const [key, metric] of Object.entries(report.benchmarks)) {
      console.log(
        `[bench] ${key.padEnd(24)} (${metric.name}): p50=${metric.p50}ms | p95=${metric.p95}ms | mean=${metric.mean}ms | min=${metric.min}ms | max=${metric.max}ms`
      )
      expect(metric.p50).toBeGreaterThan(0)
      expect(metric.p95).toBeGreaterThanOrEqual(metric.p50)
    }

    const absOut = resolve(process.cwd(), outRel)
    await mkdir(dirname(absOut), { recursive: true })

    if (compareRel) {
      const absBase = resolve(process.cwd(), compareRel)
      const baseRaw = await readFile(absBase, 'utf-8')
      const baseline = JSON.parse(baseRaw) as BenchmarkReport
      const comparison = compareBenchmarkReports(baseline, report)
      for (const row of comparison) {
        console.log(
          `[bench:compare] ${row.key.padEnd(24)} p50: ${row.baselineP50}ms -> ${row.currentP50}ms (${row.deltaP50Pct >= 0 ? '+' : ''}${row.deltaP50Pct}%) | p95: ${row.baselineP95}ms -> ${row.currentP95}ms (${row.deltaP95Pct >= 0 ? '+' : ''}${row.deltaP95Pct}%)`
        )
      }
      const vmRow = comparison.find((r) => r.key === 'vmAdvance1000Steps')
      expect(vmRow).toBeDefined()
      await writeFile(
        absOut,
        JSON.stringify({ ...report, baselineFile: compareRel, comparison }, null, 2) + '\n',
        'utf-8'
      )
      if (vmRow) {
        expect(vmRow.deltaP50Pct).toBeLessThanOrEqual(maxVmRegressionPct)
      }
    } else {
      await writeFile(absOut, JSON.stringify(report, null, 2) + '\n', 'utf-8')
    }
  })
})
