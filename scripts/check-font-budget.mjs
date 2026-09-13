#!/usr/bin/env node
/**
 * check-font-budget — 构建产物字体预算校验
 *
 * 阈值:渲染端打出的字体资产(woff/woff2/ttf/otf)原始体积合计 < 6MB。
 * 说明:woff2 本身已是压缩格式,gzip 再压缩收益 <5%,故用 raw 6MB 作为
 * "< 3MB gz" 的保守上界代理(实测总量 ~2.9MB raw)。
 *
 * 用法:pnpm build 后运行 `node scripts/check-font-budget.mjs`(已挂到 build 尾部)。
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BUDGET_BYTES = 6 * 1024 * 1024
const FONT_EXT = new Set(['.woff2', '.woff', '.ttf', '.otf'])

const rendererOut = fileURLToPath(new URL('../out/renderer', import.meta.url))

const walk = (dir) => {
  let files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files = files.concat(walk(full))
    else files.push(full)
  }
  return files
}

let fonts
try {
  fonts = walk(rendererOut).filter((f) => FONT_EXT.has(f.slice(f.lastIndexOf('.'))))
} catch {
  console.error(`[font-budget] ${rendererOut} 不存在 — 先跑 pnpm build`)
  process.exit(1)
}

if (fonts.length === 0) {
  console.error('[font-budget] 未找到任何字体资产 — @fontsource 导入可能丢失')
  process.exit(1)
}

let total = 0
for (const f of fonts) {
  const size = statSync(f).size
  total += size
}

const mib = (n) => (n / 1024 / 1024).toFixed(2)
console.log(`[font-budget] ${fonts.length} 个字体资产,合计 ${mib(total)}MB / 预算 ${mib(BUDGET_BYTES)}MB`)

if (total >= BUDGET_BYTES) {
  console.error('[font-budget] 超预算!考虑减少字重/子集(Noto Sans SC 每字重 ~2.6MB)')
  process.exit(1)
}
console.log('[font-budget] OK')
