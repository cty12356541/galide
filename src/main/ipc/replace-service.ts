/**
 * replace-service — 跨 .gal 查找替换的主进程编排层
 *
 * 纯查找/替换算法在 shared/dsl/replace-in-scripts.ts;本模块负责:
 *  - preview: 读 scripts/*.gal,产匹配列表(绝不写盘)
 *  - apply:   先 git 安全快照(复用 agent 安全闸同一机制 gitService.snapshot,
 *             见 ai/agent/agent-git.ts),再逐文件「重读 → 校验 matchedText →
 *             降序 splice → 写盘」。客户端必须回传 preview 产的精确匹配
 *             (id/file/start/end/matchedText),绝不盲替。
 *  - rollback:gitService.resetHard 到快照 ref(与 agent rollback 一致)。
 *
 * 快照失败 → 整个 apply 中止,一个文件都不写(fail-closed)。
 * apply 中途读/写失败 → 错误上携带 snapshotRef,调用方可据此 rollback。
 *
 * 依赖(fs/git)全部接口注入,handler 层绑默认实现;测试用 mock/tmp 仓库。
 */
import type { Result } from '../../shared/dsl/types.js'
import { galScriptAbs, isGalScriptFileName, scriptsDirAbs } from '../../shared/project-layout.js'
import {
  applyMatchesToContent,
  collectReplaceMatches,
  MAX_REPLACE_MATCHES,
  type CollectReplaceResult,
  type ReplaceQueryOptions,
  type ScriptReplaceMatch
} from '../../shared/dsl/replace-in-scripts.js'
import { parseCache } from './script-parse-cache.js'

export type ReplaceServiceError = {
  code:
    | 'READ_FAILED'
    | 'WRITE_FAILED'
    | 'SNAPSHOT_FAILED'
    | 'ROLLBACK_FAILED'
    | 'INVALID_REGEX'
    | 'INVALID_MATCH'
  message: string
  /** apply 中途失败时已创建的快照 ref,供调用方提示可回滚 */
  snapshotRef?: string
}

export type ReplaceFs = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  readDir: (path: string) => Promise<string[]>
}

export type ReplaceGit = {
  snapshot: (
    projectPath: string,
    label: string
  ) => Promise<Result<string, { code: string; message: string }>>
  resetHard: (
    projectPath: string,
    ref: string
  ) => Promise<Result<true, { code: string; message: string }>>
}

/** apply 时客户端回传的确认匹配(preview 产物的子集,逐字段校验) */
export type ConfirmedReplaceMatch = Pick<
  ScriptReplaceMatch,
  'id' | 'file' | 'start' | 'end' | 'matchedText'
>

export type ReplaceApplyResult = {
  applied: number
  /** stale(文件已变)被跳过的匹配 id */
  conflicts: string[]
  filesChanged: { file: string; content: string }[]
  snapshotRef: string
}

export const REPLACE_SNAPSHOT_LABEL = 'replace: 批量替换前快照' as const

const errOf = <T>(e: ReplaceServiceError): Result<T, ReplaceServiceError> => ({ ok: false, error: e })

const eMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export type PreviewReplaceRequest = ReplaceQueryOptions & { query: string }

export const previewScriptReplace = async (
  projectPath: string,
  req: PreviewReplaceRequest,
  deps: { fs: Pick<ReplaceFs, 'readFile' | 'readDir'> }
): Promise<Result<CollectReplaceResult, ReplaceServiceError>> => {
  if (req.regex === true) {
    try {
      new RegExp(req.query)
    } catch (e) {
      return errOf({ code: 'INVALID_REGEX', message: `无效正则: ${eMessage(e)}` })
    }
  }
  try {
    const r = await collectReplaceMatches(scriptsDirAbs(projectPath), req.query, req, {
      readdir: deps.fs.readDir,
      readFile: deps.fs.readFile
    })
    return { ok: true, value: r }
  } catch (e) {
    return errOf({ code: 'READ_FAILED', message: eMessage(e) })
  }
}

/** 防御性校验(schema 之外的 service 层兜底):文件名白名单 + 区间合法 */
const validateConfirmedMatch = (m: ConfirmedReplaceMatch): ReplaceServiceError | null => {
  if (!isGalScriptFileName(m.file)) {
    return { code: 'INVALID_MATCH', message: `非法文件名: ${m.file}` }
  }
  if (!Number.isInteger(m.start) || !Number.isInteger(m.end) || m.start < 0 || m.end < m.start) {
    return { code: 'INVALID_MATCH', message: `非法区间: ${m.id}` }
  }
  if (m.matchedText === '') {
    return { code: 'INVALID_MATCH', message: `空 matchedText: ${m.id}` }
  }
  return null
}

export const applyScriptReplace = async (
  projectPath: string,
  replacement: string,
  matches: readonly ConfirmedReplaceMatch[],
  deps: { fs: ReplaceFs; git: ReplaceGit }
): Promise<Result<ReplaceApplyResult, ReplaceServiceError>> => {
  if (matches.length === 0) {
    return errOf({ code: 'INVALID_MATCH', message: 'matches 不能为空' })
  }
  if (matches.length > MAX_REPLACE_MATCHES) {
    return errOf({
      code: 'INVALID_MATCH',
      message: `matches 超过上限 ${MAX_REPLACE_MATCHES}`
    })
  }
  for (const m of matches) {
    const invalid = validateConfirmedMatch(m)
    if (invalid) return errOf(invalid)
  }

  // 安全闸:先快照(与 agent 安全闸共用 gitService.snapshot 机制),失败则一个文件都不写
  const snap = await deps.git.snapshot(projectPath, REPLACE_SNAPSHOT_LABEL)
  if (snap.ok !== true) {
    return errOf({
      code: 'SNAPSHOT_FAILED',
      message: `快照失败,已中止替换: ${snap.error.message}`
    })
  }
  const snapshotRef = snap.value

  const byFile = new Map<string, ConfirmedReplaceMatch[]>()
  for (const m of matches) {
    const list = byFile.get(m.file) ?? []
    list.push(m)
    byFile.set(m.file, list)
  }

  const conflicts: string[] = []
  const filesChanged: { file: string; content: string }[] = []
  let applied = 0

  for (const [file, fileMatches] of byFile) {
    const abs = galScriptAbs(projectPath, file)
    let content: string
    try {
      content = await deps.fs.readFile(abs)
    } catch (e) {
      return errOf({
        code: 'READ_FAILED',
        message: `读取 ${file} 失败: ${eMessage(e)}`,
        snapshotRef
      })
    }
    const r = applyMatchesToContent(content, fileMatches, replacement)
    conflicts.push(...r.conflicts)
    applied += r.applied.length
    if (r.applied.length === 0) continue
    try {
      await deps.fs.writeFile(abs, r.content)
    } catch (e) {
      return errOf({
        code: 'WRITE_FAILED',
        message: `写入 ${file} 失败: ${eMessage(e)}`,
        snapshotRef
      })
    }
    parseCache.invalidate(abs)
    filesChanged.push({ file, content: r.content })
  }

  return { ok: true, value: { applied, conflicts, filesChanged, snapshotRef } }
}

export const rollbackScriptReplace = async (
  projectPath: string,
  snapshotRef: string,
  deps: { git: ReplaceGit }
): Promise<Result<true, ReplaceServiceError>> => {
  const r = await deps.git.resetHard(projectPath, snapshotRef)
  if (r.ok !== true) {
    return errOf({ code: 'ROLLBACK_FAILED', message: `回滚失败: ${r.error.message}` })
  }
  return { ok: true, value: true }
}
