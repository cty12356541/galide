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

export const useScript = () => {
  return {
    read: useCallback(
      (projectPath: string, fileName: string) =>
        wrap('script:read', () => window.galide.script.read(projectPath, fileName)),
      []
    ),
    write: useCallback(
      (projectPath: string, fileName: string, content: string) =>
        wrap('script:write', () => window.galide.script.write(projectPath, fileName, content)),
      []
    ),
    parse: useCallback((source: string) => wrapParse(source), []),
    list: useCallback(
      (projectPath: string) => wrap('script:list', () => window.galide.script.list(projectPath)),
      []
    )
  }
}
