/**
 * useMosaicPersistence — mosaic 树持久化 hook
 *
 * 行为:
 *   - mount 时:异步 read 一次,成功且 tree 非 null → setMosaicTree(tree)(覆盖默认值)
 *   - 订阅 store.mosaicTree 变化:debounce 800ms 后 write(避免拖拽时每帧写盘)
 *   - unmount 时:flush pending write(防止最后一次丢失)
 *
 * 设计决策:
 *   - 不在 useEffect 内部读 store(避免 zustand 订阅死循环),用 useUiStore.getState() 拿最新值
 *   - 写盘失败仅记录 error,不动 store(用户可继续编辑)
 *   - 不监听 aiPanelDocked / leftPanelOpen — 这些是 UI 状态,不入盘(由 zustand persist 后续接)
 *   - 只持久化 mosaic 树;dock 侧/可见主岛/子岛 tab 等工具窗 UI 状态不入盘
 */
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store'
import { useErrorStore } from '../store'
import { sanitizeTreeWithResult } from '../../components/workspace/mosaic/MosaicRoot'
import { toast } from '../../components/ui/toast'
import type { WorkspaceMosaicNode } from '../store'

const DEBOUNCE_MS_DEFAULT = 800

export const useMosaicPersistence = (opts: { debounceMs?: number } = {}): void => {
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastWrittenRef = useRef<unknown>(null) // 用于去重相同值

  // 启动期 read 一次
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await window.galide.workspace.readMosaic()
        if (cancelled) return
        if (r.ok && r.tree) {
          const result = sanitizeTreeWithResult(r.tree as WorkspaceMosaicNode)
          if (result.repaired) {
            useErrorStore.getState().push({
              code: 'MOSAIC_REPAIRED',
              source: 'mosaic-persistence',
              message: 'mosaic 布局中部分 panel id 已失效(可能是版本升级导致),已用默认值替换'
            })
            toast({
              message: 'mosaic 布局已部分修复(有 panel id 被替换)',
              variant: 'warning'
            })
          }
          useUiStore.getState().setMosaicTree(result.tree)
        } else {
          // 读盘失败:不阻断,走默认 + 警告
          useErrorStore.getState().push({
            code: 'MOSAIC_READ_FAILED',
            source: 'mosaic-persistence',
            message: `mosaic 持久化读盘失败: ${r.error ?? '未知错误'},使用默认布局`
          })
        }
      } catch (err) {
        if (cancelled) return
        useErrorStore.getState().push({
          code: 'MOSAIC_READ_EXCEPTION',
          source: 'mosaic-persistence',
          message: `mosaic 持久化读盘异常: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // 订阅 tree 变化 + debounced write
  useEffect(() => {
    const onChange = (tree: WorkspaceMosaicNode | null): void => {
      if (!tree) return
      // 去重:与上次写入相同则跳过
      if (lastWrittenRef.current === tree) return

      if (writeTimerRef.current) clearTimeout(writeTimerRef.current)
      writeTimerRef.current = setTimeout(() => {
        // 写之前再拿一次最新值(避免 debounce 期间又变)
        const latest = useUiStore.getState().mosaicTree
        if (!latest) return
        void window.galide.workspace.writeMosaic({ tree: latest }).then((r) => {
          if (r.ok) {
            lastWrittenRef.current = latest
          } else {
            useErrorStore.getState().push({
              code: 'MOSAIC_WRITE_FAILED',
              source: 'mosaic-persistence',
              message: `mosaic 持久化写盘失败: ${r.error ?? '未知错误'}`
            })
          }
        })
      }, opts.debounceMs ?? DEBOUNCE_MS_DEFAULT)
    }

    // 立即订阅当前值(若用户已设过 tree,写一次)
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.mosaicTree !== prev.mosaicTree) onChange(s.mosaicTree)
    })

    return () => {
      unsub()
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current)
        // 卸载时 flush 一次
        const latest = useUiStore.getState().mosaicTree
        if (latest && lastWrittenRef.current !== latest) {
          void window.galide.workspace.writeMosaic({ tree: latest })
          lastWrittenRef.current = latest
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
