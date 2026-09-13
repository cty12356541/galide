/**
 * replace-in-scripts — 跨 .gal 文件查找替换的纯函数核心
 *
 * 与 search-project-scripts.ts 同层(共享层、无 electron 依赖),
 * main 进程 replace-service 注入 fs 后复用;UI 不直接引用。
 *
 * 两种模式(mode):
 *  - 'plain': 纯文本子串替换(仍仅限 .gal 文件)。CJK 散文(prose)场景危险 —
 *    对白正文/注释里的子串也会被命中,调用方必须经预览确认。
 *  - 'token': 词法 token 边界模式,用于角色名/标识符重命名。
 *
 * Token 边界规则(token-boundary rule,本模块的语义契约,测试锁定):
 *   候选匹配区间 [s, e) 被拒绝,当且仅当存在某个 lexer token 区间 [ts, te)
 *   将其「真包含」: ts <= s && e <= te && (ts < s || e < te)。
 *   等价表述:匹配必须恰好覆盖一个或多个完整 token,或跨越多个 token,
 *   绝不允许是某个更长 token 的真子串。
 *   效果:
 *    - `艾: "…"` 的角色名 token 恰好被 `艾` 覆盖 → 命中(dialogue 名位)。
 *    - 对白正文 text token「我好艾不到他」中的 `艾` 是真子串 → 不命中。
 *    - 注释 comment token / unknown 行(整行散文)同理不命中。
 *    - 场景名 `## 艾的家` 的 `艾` 是 scene token 真子串 → 不命中;
 *      场景名恰好为 `艾` 时恰好覆盖 → 命中。
 *   已知限制(保守取向,文档化):条件表达式整段是单个 if/elif/when token,
 *    其中变量名(如 `[若: affinity >= 10]` 的 `affinity`)是 token 真子串,
 *    token 模式下不命中 — 变量重命名请用 plain 模式并人工核对预览。
 *
 * token 区间来源:复用 lexer.ts 的 tokenize()(单一事实源),逐 token 在行内
 * 顺序定位 value 得到 [start, end);set token 的 value 为 `name|op|value`
 * 复合串,特判取变量名片段定位。tokenize 不产生 newline/空 value 以外的
 * 无区间 token,定位失败时跳过该 token(防御,不影响规则正确性:
 * 未覆盖区间不会被任何 token「真包含」判负)。
 */
import { tokenize } from './lexer.js'
import type { TokenType } from './types.js'
import { isGalScriptFileName } from '../project-layout.js'
import { join } from 'node:path'

/** 单次替换预览的匹配上限 — 防爆量保护,超过即截断并置 truncated */
export const MAX_REPLACE_MATCHES = 500

export type ScriptReplaceMode = 'plain' | 'token'

/** 匹配的 token 分类:恰好覆盖单个 token 时为该 token 类型;否则为 'plain'(跨 token/标点) */
export type ReplaceMatchTokenKind = TokenType | 'plain'

export type ScriptReplaceMatch = {
  /** 稳定 id:`${file}:${line}:${start}:${end}`,apply 时由客户端原样回传 */
  id: string
  file: string
  line: number
  column: number
  /** 文件内容内的绝对偏移,[start, end) */
  start: number
  end: number
  matchedText: string
  /** 所在行文本(trim,>120 截断),供预览展示 */
  context: string
  tokenKind: ReplaceMatchTokenKind
}

export type ReplaceQueryOptions = {
  mode: ScriptReplaceMode
  /** true 时 query 按 RegExp 处理(默认 false,纯文本) */
  regex?: boolean
}

export type CollectReplaceResult = {
  matches: ScriptReplaceMatch[]
  truncated: boolean
}

export type ReplaceCollectFs = {
  readdir: (path: string) => Promise<string[]>
  readFile: (path: string) => Promise<string>
}

type TokenRange = { start: number; end: number; type: TokenType }

const eHasCode = (e: unknown, code: string): boolean =>
  e instanceof Error && 'code' in e && (e as { code?: unknown }).code === code

/**
 * 由 lexer token 推导行内 token 区间。
 * lexer 的 Token.column 恒为 1(无偏移),这里按 token 顺序在行内扫描 value 定位;
 * 顺序扫描 + cursor 前进保证重复值(如 `艾: "艾"`)各自落到正确区间。
 */
export const lineTokenRanges = (line: string): TokenRange[] => {
  const ranges: TokenRange[] = []
  const tokens = tokenize(line)
  let cursor = 0
  for (const t of tokens) {
    if (t.type === 'newline' || t.value === '') continue
    if (t.type === 'set') {
      // set token value 是 `name|op|value` 复合串,行内不存在,定位变量名片段
      const name = t.value.split('|')[0] ?? ''
      if (name === '') continue
      const idx = line.indexOf(name, cursor)
      if (idx < 0) continue
      ranges.push({ start: idx, end: idx + name.length, type: 'set' })
      cursor = idx + name.length
      continue
    }
    const idx = line.indexOf(t.value, cursor)
    if (idx < 0) continue
    ranges.push({ start: idx, end: idx + t.value.length, type: t.type })
    cursor = idx + t.value.length
  }
  return ranges
}

/**
 * token 边界规则判定:匹配被某个 token 真包含 → true(应拒绝)。
 * 恰好等于某 token 区间(完整覆盖)不算真包含。
 */
const isEmbeddedInToken = (start: number, end: number, ranges: TokenRange[]): boolean =>
  ranges.some((r) => r.start <= start && end <= r.end && (r.start < start || end < r.end))

/** 恰好覆盖单个 token 时返回其类型,用于预览展示 tokenKind */
const exactCoverKind = (
  start: number,
  end: number,
  ranges: TokenRange[]
): ReplaceMatchTokenKind => {
  const hit = ranges.find((r) => r.start === start && r.end === end)
  return hit ? hit.type : 'plain'
}

type RawCandidate = { start: number; end: number; text: string }

/** 行内候选匹配(未过 token 过滤)。纯文本为所有出现位置;regex 用 g flag 全量。 */
const lineCandidates = (line: string, query: string, regex: boolean): RawCandidate[] => {
  const out: RawCandidate[] = []
  if (regex) {
    // 调用方(schema/服务层)已校验正则合法性;这里再防御一次,非法正则按无匹配处理
    let re: RegExp
    try {
      re = new RegExp(query, 'gu')
    } catch {
      return out
    }
    for (const m of line.matchAll(re)) {
      const start = m.index ?? 0
      const text = m[0]
      // 零宽匹配防护:跳过,防止 \b / x? 之类在 token 模式下刷屏
      if (text === '') continue
      out.push({ start, end: start + text.length, text })
    }
    return out
  }
  let from = 0
  for (;;) {
    const idx = line.indexOf(query, from)
    if (idx < 0) break
    out.push({ start: idx, end: idx + query.length, text: query })
    from = idx + query.length
  }
  return out
}

const contextOf = (line: string): string => {
  const trimmed = line.trim()
  return trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed
}

/**
 * 单文件内容内查找匹配。返回匹配数组(可能超过上限,由 collect 层截断)。
 * query 为空串返回空。
 */
export const findReplaceMatchesInContent = (
  file: string,
  content: string,
  query: string,
  opts: ReplaceQueryOptions
): ScriptReplaceMatch[] => {
  if (query === '') return []
  const matches: ScriptReplaceMatch[] = []
  const lines = content.split('\n')
  let lineStart = 0
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? ''
    // \r\n 文件:行尾 \r 不参与匹配/tokenize(与 parser 的 normalize 对齐)
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const candidates = lineCandidates(line, query, opts.regex === true)
    if (candidates.length > 0) {
      const ranges = opts.mode === 'token' ? lineTokenRanges(line) : []
      for (const c of candidates) {
        if (opts.mode === 'token' && isEmbeddedInToken(c.start, c.end, ranges)) continue
        const start = lineStart + c.start
        const end = lineStart + c.end
        matches.push({
          id: `${file}:${i + 1}:${start}:${end}`,
          file,
          line: i + 1,
          column: c.start + 1,
          start,
          end,
          matchedText: c.text,
          context: contextOf(line),
          tokenKind: opts.mode === 'token' ? exactCoverKind(c.start, c.end, ranges) : 'plain'
        })
      }
    }
    lineStart += rawLine.length + 1
  }
  return matches
}

/**
 * 项目级收集:扫 scriptsDir 下全部 .gal(与 searchProjectScripts 同约定:
 * ENOENT → 空结果;其他 readdir 错误 → 抛 READ_FAILED)。
 * 超过 MAX_REPLACE_MATCHES 截断并置 truncated=true。
 */
export const collectReplaceMatches = async (
  scriptsDir: string,
  query: string,
  opts: ReplaceQueryOptions,
  fs: ReplaceCollectFs
): Promise<CollectReplaceResult> => {
  const q = opts.regex === true ? query : query.trim()
  if (q === '') return { matches: [], truncated: false }

  let files: string[] = []
  try {
    files = (await fs.readdir(scriptsDir)).filter((f) => isGalScriptFileName(f)).sort()
  } catch (e) {
    if (eHasCode(e, 'ENOENT')) return { matches: [], truncated: false }
    throw Object.assign(new Error(e instanceof Error ? e.message : String(e)), {
      code: 'READ_FAILED'
    })
  }

  const matches: ScriptReplaceMatch[] = []
  let truncated = false
  for (const file of files) {
    const content = await fs.readFile(join(scriptsDir, file))
    const fileMatches = findReplaceMatchesInContent(file, content, q, opts)
    for (const m of fileMatches) {
      if (matches.length >= MAX_REPLACE_MATCHES) {
        truncated = true
        break
      }
      matches.push(m)
    }
    if (truncated) break
  }
  return { matches, truncated }
}

export type ApplyToContentResult = {
  content: string
  /** 实际应用的匹配 id */
  applied: string[]
  /** 校验失败(文件已变,matchedText 与区间内容不符)被跳过的匹配 id */
  conflicts: string[]
}

/**
 * 把确认过的匹配应用到单文件内容(纯函数,不写盘)。
 * 逐匹配校验 content.slice(start, end) === matchedText(stale 防护),
 * 不符则记入 conflicts 跳过 — 绝不盲替。按 start 降序 splice,偏移互不影响。
 */
export const applyMatchesToContent = (
  content: string,
  matches: readonly Pick<ScriptReplaceMatch, 'id' | 'start' | 'end' | 'matchedText'>[],
  replacement: string
): ApplyToContentResult => {
  const sorted = [...matches].sort((a, b) => b.start - a.start)
  const applied: string[] = []
  const conflicts: string[] = []
  let next = content
  for (const m of sorted) {
    if (m.start < 0 || m.end < m.start || m.end > next.length) {
      conflicts.push(m.id)
      continue
    }
    if (next.slice(m.start, m.end) !== m.matchedText) {
      conflicts.push(m.id)
      continue
    }
    next = next.slice(0, m.start) + replacement + next.slice(m.end)
    applied.push(m.id)
  }
  // applied 当前是降序,反转为文件序,便于报告
  applied.reverse()
  return { content: next, applied, conflicts }
}
