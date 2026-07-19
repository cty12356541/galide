// Spike-only vitest config: lets us run the repo's TS export pipeline from a
// scratch harness without touching the repo's vitest.config.ts.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: new URL('../..', import.meta.url).pathname.replace(/\/$/, ''),
  test: {
    include: ['.omo/spike/**/*.spike.test.ts'],
    environment: 'node'
  }
})
