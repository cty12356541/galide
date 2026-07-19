/**
 * useScriptReplace — script:replacePreview / replaceApply / replaceRollback 封装
 * 规约: .style-spec/layers/renderer/conventions.yaml:19-22 (ipc_abstraction)
 */
import { useCallback } from 'react'
import { useErrorStore } from '../store'
import type {
  ScriptReplaceMatch,
  ScriptReplaceMode
} from '../../../../shared/dsl/replace-in-scripts.js'

export type ReplacePreviewResult =
  | { ok: true; matches: ScriptReplaceMatch[]; truncated: boolean }
  | { ok: false; code: string; error: string }

export type ReplaceApplyResult =
  | { ok: true; applied: number; conflicts: string[]; filesChanged: string[]; snapshotRef: string }
  | { ok: false; code: string; error: string; snapshotRef?: string }

export const useScriptReplace = () => {
  const preview = useCallback(
    async (
      projectPath: string,
      query: string,
      mode: ScriptReplaceMode
    ): Promise<ReplacePreviewResult | undefined> => {
      try {
        return await window.galide.script.replacePreview({ projectPath, query, mode })
      } catch (err) {
        useErrorStore.getState().push({
          code: 'IPC_ERROR',
          message: err instanceof Error ? err.message : String(err),
          source: 'script:replacePreview'
        })
        return undefined
      }
    },
    []
  )

  const apply = useCallback(
    async (
      projectPath: string,
      replacement: string,
      matches: Pick<ScriptReplaceMatch, 'id' | 'file' | 'start' | 'end' | 'matchedText'>[]
    ): Promise<ReplaceApplyResult | undefined> => {
      try {
        return await window.galide.script.replaceApply({ projectPath, replacement, matches })
      } catch (err) {
        useErrorStore.getState().push({
          code: 'IPC_ERROR',
          message: err instanceof Error ? err.message : String(err),
          source: 'script:replaceApply'
        })
        return undefined
      }
    },
    []
  )

  return { preview, apply }
}
