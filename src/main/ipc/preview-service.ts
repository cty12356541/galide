/**
 * preview-service — 预览存档读写(.galide/saves/)
 */
import { join } from 'node:path'
import {
  deserializeVmSave,
  saveSlotFileName,
  savesDirRel,
  serializeVmSave,
  type VmSaveFile
} from '../../shared/preview/vm-save.js'
import type { VmState, VmReadState } from '../../shared/preview/runtime-vm.js'

export interface PreviewFs {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void | string>
  readdir: (path: string) => Promise<string[]>
}

export interface PreviewSaveResult {
  ok: true
  timestamp: string
}

export interface PreviewLoadResult {
  ok: true
  state: VmState
  timestamp: string
}

export interface PreviewSlotInfo {
  slot: number
  timestamp: string | null
  sceneId: string | null
  occupied: boolean
}

export type PreviewServiceError = {
  ok: false
  error: { code: string; message: string }
}

const slotPath = (projectPath: string, slot: number): string =>
  join(projectPath, savesDirRel, saveSlotFileName(slot))

export const savePreviewSlot = async (
  projectPath: string,
  slot: number,
  state: VmState,
  fs: PreviewFs
): Promise<PreviewSaveResult | PreviewServiceError> => {
  if (slot < 1 || slot > 3) {
    return { ok: false, error: { code: 'INVALID_SLOT', message: 'slot must be 1-3' } }
  }
  try {
    const dir = join(projectPath, savesDirRel)
    await fs.mkdir(dir, { recursive: true })
    const file = serializeVmSave(state, slot)
    await fs.writeFile(slotPath(projectPath, slot), JSON.stringify(file, null, 2))
    return { ok: true, timestamp: file.timestamp }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'WRITE_FAILED', message: e instanceof Error ? e.message : String(e) }
    }
  }
}

export const loadPreviewSlot = async (
  projectPath: string,
  slot: number,
  fs: PreviewFs
): Promise<PreviewLoadResult | PreviewServiceError> => {
  if (slot < 1 || slot > 3) {
    return { ok: false, error: { code: 'INVALID_SLOT', message: 'slot must be 1-3' } }
  }
  try {
    const raw = await fs.readFile(slotPath(projectPath, slot))
    const parsed = JSON.parse(raw) as VmSaveFile
    const state = deserializeVmSave(parsed)
    if (!state) {
      return { ok: false, error: { code: 'INVALID_SAVE', message: 'save file version mismatch' } }
    }
    return { ok: true, state, timestamp: parsed.timestamp }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'READ_FAILED', message: e instanceof Error ? e.message : String(e) }
    }
  }
}

export const listPreviewSlots = async (
  projectPath: string,
  fs: PreviewFs
): Promise<PreviewSlotInfo[]> => {
  const slots: PreviewSlotInfo[] = []
  for (let slot = 1; slot <= 3; slot++) {
    try {
      const raw = await fs.readFile(slotPath(projectPath, slot))
      const parsed = JSON.parse(raw) as VmSaveFile
      slots.push({ slot, timestamp: parsed.timestamp ?? null, sceneId: parsed.currentSceneId ?? null, occupied: true })
    } catch {
      slots.push({ slot, timestamp: null, sceneId: null, occupied: false })
    }
  }
  return slots
}

const readStatePath = (projectPath: string): string =>
  join(projectPath, '.galide', 'read-state.json')

const emptyReadState = (): VmReadState => ({ readLineIds: [] })

/** 全局已读记录(跨存档槽);不存在/损坏 → 空 */
export const loadPreviewReadState = async (
  projectPath: string,
  fs: PreviewFs
): Promise<VmReadState> => {
  try {
    const raw = await fs.readFile(readStatePath(projectPath))
    const parsed = JSON.parse(raw) as VmReadState
    if (!Array.isArray(parsed.readLineIds)) return emptyReadState()
    return { readLineIds: parsed.readLineIds.filter((id): id is string => typeof id === 'string') }
  } catch {
    return emptyReadState()
  }
}

export const savePreviewReadState = async (
  projectPath: string,
  readState: VmReadState,
  fs: PreviewFs
): Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }> => {
  try {
    await fs.mkdir(join(projectPath, '.galide'), { recursive: true })
    await fs.writeFile(readStatePath(projectPath), JSON.stringify(readState))
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: { code: 'READ_STATE_WRITE_FAILED', message: e instanceof Error ? e.message : String(e) }
    }
  }
}
