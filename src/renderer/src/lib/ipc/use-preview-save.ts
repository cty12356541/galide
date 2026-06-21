import { useCallback } from 'react'
import type { VmState } from '../../../../shared/preview/runtime-vm'

export interface PreviewSlotInfo {
  slot: number
  timestamp: string | null
  occupied: boolean
}

export interface UsePreviewSaveResult {
  saveSlot: (slot: number, state: VmState) => Promise<{ ok: boolean; timestamp?: string; error?: string }>
  loadSlot: (slot: number) => Promise<{ ok: boolean; state?: VmState; timestamp?: string; error?: string }>
  listSlots: () => Promise<PreviewSlotInfo[]>
}

export const usePreviewSave = (projectPath: string | null): UsePreviewSaveResult => {
  const saveSlot = useCallback(
    async (slot: number, state: VmState) => {
      if (!projectPath) return { ok: false, error: '项目未打开' }
      try {
        const r = await window.galide.preview.saveSlot({ projectPath, slot, state })
        if (r.ok === false) return { ok: false, error: r.error }
        return { ok: true, timestamp: r.timestamp }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
    [projectPath]
  )

  const loadSlot = useCallback(
    async (slot: number) => {
      if (!projectPath) return { ok: false, error: '项目未打开' }
      try {
        const r = await window.galide.preview.loadSlot({ projectPath, slot })
        if (r.ok === false) return { ok: false, error: r.error }
        return { ok: true, state: r.state as VmState, timestamp: r.timestamp }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },
    [projectPath]
  )

  const listSlots = useCallback(async () => {
    if (!projectPath) return []
    try {
      const r = await window.galide.preview.listSlots(projectPath)
      if (!r.ok) return []
      return r.slots
    } catch {
      return []
    }
  }, [projectPath])

  return { saveSlot, loadSlot, listSlots }
}
