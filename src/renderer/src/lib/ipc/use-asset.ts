/**
 * useAsset — 资源解析 hook
 *
 * P0-3 修复: 解决 PixiJS / Audio 在 file:// 协议下拿不到相对路径解析
 *
 * 用法:
 *   const { resolve, resolveAsync } = useAsset()
 *   const r = await resolveAsync(projectPath, 'assets/bg/classroom.png')
 *   if (r.ok && r.isDataUrl) {
 *     // 用 r.dataUrl 喂 PixiJS / Audio
 *   }
 */
import { useCallback } from 'react'
import { useErrorStore } from '../store'

export type AssetResolveResult = {
  ok: boolean
  dataUrl?: string
  absolutePath?: string
  mime?: string
  size?: number
  isDataUrl?: boolean
  code?: string
  error?: string
}

export const useAsset = () => {
  return {
    resolveAsync: useCallback(
      async (projectPath: string, relPath: string): Promise<AssetResolveResult> => {
        try {
          return await window.galide.asset.resolve({ projectPath, relPath })
        } catch (err) {
          useErrorStore.getState().push({
            code: 'IPC_ERROR',
            message: err instanceof Error ? err.message : String(err),
            source: 'asset:resolve'
          })
          return { ok: false, code: 'IPC_ERROR', error: err instanceof Error ? err.message : String(err) }
        }
      },
      []
    )
  }
}
