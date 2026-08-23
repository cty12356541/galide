import { defineConfig } from 'vitest/config'

/**
 * 真实模型 agent eval 配置 — 本地手动运行(pnpm eval:agent),不进 CI。
 * 需要环境变量: GALIDE_EVAL_PROVIDER / GALIDE_EVAL_MODEL + 对应 API key。
 */
export default defineConfig({
  test: {
    include: ['scripts/eval/**/*.test.ts'],
    testTimeout: 600_000,
    hookTimeout: 60_000,
    environment: 'node'
  }
})
