import { useCallback } from 'react'
import { useErrorStore } from '../store'
import type { Result, ScriptNode, ParseError } from '../../../../shared/dsl/types'

type ParseResult = Result<ScriptNode, ParseError[]>

const wrapParse = async (source: string): Promise<ParseResult> => {
  try {
    return await window.galide.script.parse(source)
  } catch (err) {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      source: 'script:parse'
    })
    return { ok: false, error: [{ line: 0, column: 0, message: String(err), severity: 'error' }] }
  }
}

const wrap = async <T>(source: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      source
    })
    return undefined
  }
}

/**
 * script.write 现在返回 { ok, error?, code? }(P1 修复后),
 * 失败时不能再被当作"成功"。这里明确处理。
 */
type WriteResult = { ok: boolean; error?: string; code?: string }
const wrapWrite = async (
  fn: () => Promise<WriteResult>
): Promise<{ ok: true } | { ok: false; code?: string; error: string }> => {
  try {
    const r = await fn()
    if (r.ok) return { ok: true }
    useErrorStore.getState().push({
      code: r.code === 'INVALID_FILENAME' ? 'INVALID_FILENAME' : 'SAVE_FAILED',
      message: r.error ?? 'unknown',
      source: 'script:write'
    })
    return { ok: false, code: r.code, error: r.error ?? 'unknown' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message,
      source: 'script:write'
    })
    return { ok: false, error: message }
  }
}

export const useScript = () => {
  return {
    read: useCallback(
      (projectPath: string, fileName: string) =>
        wrap('script:read', () => window.galide.script.read(projectPath, fileName)),
      []
    ),
    write: useCallback(
      (projectPath: string, fileName: string, content: string) =>
        wrapWrite(() => window.galide.script.write(projectPath, fileName, content)),
      []
    ),
    parse: useCallback((source: string) => wrapParse(source), []),
    list: useCallback(
      (projectPath: string) => wrap('script:list', () => window.galide.script.list(projectPath)),
      []
    )
  }
}
