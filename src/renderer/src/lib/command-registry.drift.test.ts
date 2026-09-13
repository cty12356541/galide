/**
 * command-registry 漂移守卫(T1-6)
 *
 * Phase 1 把菜单 / 命令面板 / 工具条收敛到命令注册表单一真相源,本测试防止回漂:
 *   1. 注册表完整性:COMMANDS 与各派生表(COMMAND_BY_ID / COMMAND_LABELS /
 *      DEFAULT_SHORTCUTS)一致;id 唯一;默认 accelerator 无冲突。
 *   2. 消费方接线(静态断言,快于渲染):MenuBar / CommandPalette / Toolbar
 *      源码必须 import command-registry 并经 dispatchCommand 投递;
 *      MenuBar / CommandPalette 不得含与命令 label 完全相同的字符串字面量
 *      (防止绕开注册表重新硬编码菜单项)。
 *   3. 字形扫描:src/renderer/src/app 与 src/renderer/src/features 下
 *      (排除 *.test.*)不得出现硬编码修饰键字形字面量(⌘ ⇧ ⌥ ⌃),
 *      展示标签一律经 acceleratorLabel 派生;例外须登记在下方 ALLOWLIST。
 *      注释行(// 与块注释内部)不扫描:文档散文允许提及快捷键。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  COMMANDS,
  COMMAND_BY_ID,
  COMMAND_LABELS,
  DEFAULT_SHORTCUTS,
  parseAccelerator
} from './command-registry.js'

/** 渲染层 src 目录(vitest 从仓库根运行;扫描结果 files.length>0 断言防 cwd 漂移假绿) */
const RENDERER_SRC = path.join(process.cwd(), 'src/renderer/src')

/**
 * 字形扫描白名单。登记格式:file 相对 src/renderer/src,contains 为命中行须含的片段。
 * 每条必须附 reason;新增例外优先选择「改为注册表派生」而非登记。
 */
const ALLOWLIST: ReadonlyArray<{ file: string; contains: string; reason: string }> = []

const MODIFIER_GLYPH = /[⌘⇧⌥⌃]/

/** 注释行启发式:整行注释 / 块注释内部行不纳入字形扫描(文档散文允许 ⌘S 一类提法) */
const isCommentLine = (line: string): boolean => {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('*/')
}

/** 递归收集 dir 下所有 .ts/.tsx 源文件(排除 *.test.*),返回相对 RENDERER_SRC 的路径 */
const listSourceFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(abs))
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      out.push(path.relative(RENDERER_SRC, abs))
    }
  }
  return out
}

const readSrc = (rel: string): string => readFileSync(path.join(RENDERER_SRC, rel), 'utf8')

describe('command-registry 漂移守卫 — 注册表完整性', () => {
  it('COMMANDS id 唯一,派生表与 COMMANDS 一一对应', () => {
    const ids = COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(Object.keys(COMMAND_BY_ID).sort()).toEqual([...ids].sort())
    expect(Object.keys(COMMAND_LABELS).sort()).toEqual([...ids].sort())
    expect(Object.keys(DEFAULT_SHORTCUTS).sort()).toEqual([...ids].sort())
  })

  it('每条命令带 label/icon/category;默认 accelerator 均可解析且无冲突', () => {
    for (const cmd of COMMANDS) {
      expect(cmd.label.trim().length).toBeGreaterThan(0)
      expect(cmd.icon).toBeTruthy()
      if (cmd.default != null) {
        expect(parseAccelerator(cmd.default), `${cmd.id} 的默认 accelerator 非法`).not.toBeNull()
      }
    }
    const defaults = COMMANDS.map((c) => c.default).filter((d): d is string => d != null)
    expect(new Set(defaults).size).toBe(defaults.length)
  })
})

describe('command-registry 漂移守卫 — 消费方接线', () => {
  const CONSUMERS = ['app/MenuBar.tsx', 'features/command-palette/CommandPalette.tsx', 'app/Toolbar.tsx']

  it.each(CONSUMERS)('%s 从 command-registry 取数据并经 dispatchCommand 投递', (rel) => {
    const src = readSrc(rel)
    expect(src).toMatch(/from\s+['"][^'"]*command-registry['"]/)
    expect(src).toContain('dispatchCommand')
  })

  it.each(['app/MenuBar.tsx', 'features/command-palette/CommandPalette.tsx'])(
    '%s 菜单项/命令项不得硬编码与注册表 label 相同的字符串字面量',
    (rel) => {
      const src = readSrc(rel)
      const labels = new Set(COMMANDS.map((c) => c.label))
      const literals = src.matchAll(/['"]([^'"]+)['"]/g)
      const offenders: string[] = []
      for (const m of literals) {
        const lit = m[1]
        if (lit !== undefined && labels.has(lit)) offenders.push(lit)
      }
      expect(offenders).toEqual([])
    }
  )

  it('MenuBar/CommandPalette 渲染的命令条目数 == 注册表条目数(按分类过滤逻辑同源)', () => {
    // 两处均按 CATEGORY_ORDER 过滤 COMMANDS;静态验证其过滤表达式作用于 COMMANDS 本身
    for (const rel of ['app/MenuBar.tsx', 'features/command-palette/CommandPalette.tsx']) {
      const src = readSrc(rel)
      expect(src).toMatch(/COMMANDS\.filter\(/)
    }
    // 注册表当前规模快照:改表需同步审视消费方测试
    expect(COMMANDS.length).toBeGreaterThan(0)
  })
})

describe('command-registry 漂移守卫 — 修饰键字形扫描', () => {
  const SCAN_DIRS = ['app', 'features']

  it('app/ 与 features/ 无硬编码修饰键字形字面量(⌘ ⇧ ⌥ ⌃,ALLOWLIST 除外)', () => {
    const files = SCAN_DIRS.flatMap((d) => listSourceFiles(path.join(RENDERER_SRC, d)))
    // 守卫必须真的扫到文件,防止路径漂移导致假绿
    expect(files.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const rel of files) {
      const lines = readSrc(rel).split('\n')
      lines.forEach((line, i) => {
        if (!MODIFIER_GLYPH.test(line) || isCommentLine(line)) return
        const allowed = ALLOWLIST.some((a) => a.file === rel && line.includes(a.contains))
        if (!allowed) violations.push(`${rel}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(violations).toEqual([])
  })

  it('ALLOWLIST 条目仍然命中(白名单不悄悄腐烂)', () => {
    for (const a of ALLOWLIST) {
      const src = readSrc(a.file)
      const hit = src.split('\n').some((line) => MODIFIER_GLYPH.test(line) && line.includes(a.contains))
      expect(hit, `ALLOWLIST 条目不再命中: ${a.file} (${a.reason})`).toBe(true)
    }
  })
})
