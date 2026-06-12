import { useCallback, useEffect, useState } from 'react'
import { useUiStore } from '../store'

type Recorded = {
  accelerator: string
  isComposing: boolean
}

/**
 * 键盘快捷键录制 hook
 * 按下时开始录制,松开 Esc 取消,松开非修饰键确认
 *
 * P1-3 修复: 录制状态同步到 useUiStore.shortcutRecording,
 * App 级 keydown handler 据此 early-return,避免外层 Esc 关 Preferences
 * 与录制中的 Esc 取消冲突。
 */
export const useShortcutRecorder = (onConfirm: (acc: string) => void) => {
  const [recording, setRecordingState] = useState(false)
  const [composing, setComposing] = useState<Recorded | null>(null)
  const setStoreRecording = useUiStore((s) => s.setShortcutRecording)

  // 包装 setRecording:同步到 store
  const setRecording = useCallback(
    (next: boolean) => {
      setRecordingState(next)
      setStoreRecording(next)
    },
    [setStoreRecording]
  )

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (!recording) return
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(false)
        setComposing(null)
        return
      }
      if (e.key === 'Control' || e.key === 'Meta' || e.key === 'Alt' || e.key === 'Shift') {
        return
      }
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.metaKey) parts.push('Meta')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      parts.push(e.key)
      const acc = parts.join('+')
      setRecording(false)
      setComposing({ accelerator: acc, isComposing: false })
      onConfirm(acc)
    },
    [recording, onConfirm, setRecording]
  )

  useEffect(() => {
    if (!recording) return
    window.addEventListener('keydown', handleKey, { capture: true })
    return () => window.removeEventListener('keydown', handleKey, { capture: true })
  }, [recording, handleKey])

  // 卸载兜底:组件 unmount 时如果仍在录制,清掉 store 标记
  useEffect(() => {
    return () => {
      if (recording) setStoreRecording(false)
    }
  }, [recording, setStoreRecording])

  return { recording, setRecording, composing }
}
