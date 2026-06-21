/**
 * useScriptSave — 卡片/源码统一自动存盘(C1)
 *
 * debounce 800ms;⌘S / flushSave 立即写盘;scriptDirty 由 store 单一真相源。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useUiStore } from '../store'
import { useScript } from '../ipc/use-script'
import { toast } from '../../components/ui/toast'

const DEBOUNCE_MS = 800

let debounceTimer: ReturnType<typeof setTimeout> | null = null

/** 测试用:清 debounce 计时器 */
export const resetScriptSaveTimer = (): void => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

export interface UseScriptSaveResult {
  saving: boolean
  scheduleSave: () => void
  flushSave: () => Promise<void>
}

export const useScriptSave = (): UseScriptSaveResult => {
  const markScriptSaved = useUiStore((s) => s.markScriptSaved)
  const script = useScript()
  const scriptRef = useRef(script)
  scriptRef.current = script
  const [saving, setSaving] = useState(false)

  const flushSave = useCallback(async (): Promise<void> => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    const s = useUiStore.getState()
    if (!s.scriptDirty || !s.projectPath || !s.activeScriptFile) return
    setSaving(true)
    try {
      const r = await scriptRef.current.write(
        s.projectPath,
        s.activeScriptFile,
        s.scriptSource
      )
      if (r && r.ok === true) {
        markScriptSaved()
      } else if (r && r.ok !== true) {
        toast({
          message: r.code === 'COMMIT_FAILED' ? '保存成功,但 git commit 失败' : '保存失败',
          variant: 'error'
        })
      }
    } finally {
      setSaving(false)
    }
  }, [markScriptSaved])

  const scheduleSave = useCallback((): void => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void flushSave()
    }, DEBOUNCE_MS)
  }, [flushSave])

  useEffect(() => {
    useUiStore.getState().registerScriptSaveFlush(flushSave)
    return () => {
      resetScriptSaveTimer()
      useUiStore.getState().registerScriptSaveFlush(null)
    }
  }, [flushSave])

  return { saving, scheduleSave, flushSave }
}
