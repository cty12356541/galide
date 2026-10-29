import { defineConfig } from 'vitest/config'

/**
 * 性能基准套件配置 — 纯 Node 环境运行(无 Electron/GUI 依赖),CI 可跑。
 * 入口: `node scripts/bench/run.mjs` 或 `pnpm bench`
 */
export default defineConfig({
  test: {
    include: ['scripts/bench/**/*.bench-runner.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    environment: 'node'
  }
})
