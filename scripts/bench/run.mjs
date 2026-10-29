#!/usr/bin/env node
/**
 * CLI 入口:
 *   node scripts/bench/run.mjs [--out .omo/bench/baseline.json] [--compare .omo/bench/baseline.json]
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const args = process.argv.slice(2)
let outPath = '.omo/bench/baseline.json'
let comparePath = ''

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out' && args[i + 1]) {
    outPath = args[i + 1]
    i++
  } else if (args[i] === '--compare' && args[i + 1]) {
    comparePath = args[i + 1]
    i++
  }
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const vitestBin = resolve(repoRoot, 'node_modules/.bin/vitest')

const env = {
  ...process.env,
  GALIDE_BENCH_OUT: outPath,
  ...(comparePath ? { GALIDE_BENCH_COMPARE: comparePath } : {})
}

const res = spawnSync(vitestBin, ['run', '--config', 'vitest.bench.config.ts'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env
})

process.exit(res.status ?? 1)
