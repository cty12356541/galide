/**
 * vm-save — 预览/Web 播放器 VmState 存档格式
 *
 * 项目本地: .galide/saves/slot-{n}.json
 * Web 嵌入: localStorage key galide-save-{projectId}-slot-{n}
 */
import type { PlaybackStep } from './playback-timeline'
import type { VmState } from './runtime-vm'

export const VM_SAVE_VERSION = 1
export const PREVIEW_SAVE_SLOT_COUNT = 3

export interface VmSaveFile {
  version: number
  slot: number
  timestamp: string
  variables: Record<string, unknown>
  currentSceneId: string
  stepIndex: number
  branchQueue?: PlaybackStep[]
}

export const saveSlotFileName = (slot: number): string => `slot-${slot}.json`

export const savesDirRel = '.galide/saves'

/** Web player localStorage key (parity with desktop slot files) */
export const buildWebSaveKey = (projectId: string, slot?: number): string =>
  slot !== undefined ? `galide-save-${projectId}-slot-${slot}` : `galide-save-${projectId}`

export const serializeVmSave = (state: VmState, slot: number): VmSaveFile => ({
  version: VM_SAVE_VERSION,
  slot,
  timestamp: new Date().toISOString(),
  variables: { ...state.variables },
  currentSceneId: state.sceneId,
  stepIndex: state.stepIndex,
  ...(state.branchQueue !== undefined ? { branchQueue: state.branchQueue } : {})
})

export const deserializeVmSave = (file: VmSaveFile): VmState | null => {
  if (file.version !== VM_SAVE_VERSION) return null
  if (!file.currentSceneId || typeof file.stepIndex !== 'number') return null
  return {
    sceneId: file.currentSceneId,
    stepIndex: file.stepIndex,
    variables: file.variables ?? {},
    ...(file.branchQueue !== undefined ? { branchQueue: file.branchQueue } : {})
  }
}

/** @internal Browser-embeddable */
export function serializeVmSaveImpl(state, slot) {
  return {
    version: VM_SAVE_VERSION,
    slot,
    timestamp: new Date().toISOString(),
    variables: Object.assign({}, state.variables),
    currentSceneId: state.sceneId,
    stepIndex: state.stepIndex,
    ...(state.branchQueue !== undefined ? { branchQueue: state.branchQueue } : {})
  }
}

/** @internal Browser-embeddable */
export function deserializeVmSaveImpl(file) {
  if (file.version !== VM_SAVE_VERSION) return null
  if (!file.currentSceneId || typeof file.stepIndex !== 'number') return null
  return {
    sceneId: file.currentSceneId,
    stepIndex: file.stepIndex,
    variables: file.variables || {},
    ...(file.branchQueue !== undefined ? { branchQueue: file.branchQueue } : {})
  }
}

/** @internal Browser-embeddable */
export function buildWebSaveKeyImpl(projectId, slot) {
  return slot !== undefined ? 'galide-save-' + projectId + '-slot-' + slot : 'galide-save-' + projectId
}

/** Browser-embeddable save functions for web export inline script. */
export function buildPlayerSaveFunctions(): string {
  return [
    'const VM_SAVE_VERSION = 1;',
    serializeVmSaveImpl.toString(),
    deserializeVmSaveImpl.toString(),
    buildWebSaveKeyImpl.toString(),
    'const serializeVmSave = serializeVmSaveImpl;',
    'const deserializeVmSave = deserializeVmSaveImpl;',
    'const buildWebSaveKey = buildWebSaveKeyImpl;'
  ].join('\n\n')
}
