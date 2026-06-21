/**
 * vm-save — VmState 存档序列化/反序列化(TDD)
 */
import { describe, expect, it } from 'vitest'
import type { PlaybackStep } from './playback-timeline'
import {
  VM_SAVE_VERSION,
  buildWebSaveKey,
  deserializeVmSave,
  saveSlotFileName,
  serializeVmSave,
  type VmSaveFile
} from './vm-save'
import type { VmState } from './runtime-vm'

describe('vm-save', () => {
  const sampleState: VmState = {
    sceneId: '教室',
    stepIndex: 3,
    variables: { affinity: 10, flag: true, name: 'hero' },
    branchQueue: [{ type: 'dialogue', character: '小雪', text: 'branch line' }]
  }

  it('serializeVmSave produces versioned JSON shape', () => {
    const file = serializeVmSave(sampleState, 1)
    expect(file.version).toBe(VM_SAVE_VERSION)
    expect(file.slot).toBe(1)
    expect(file.timestamp).toMatch(/^\d{4}-/)
    expect(file.variables).toEqual(sampleState.variables)
    expect(file.currentSceneId).toBe('教室')
    expect(file.stepIndex).toBe(3)
    expect(file.branchQueue).toHaveLength(1)
  })

  it('deserializeVmSave round-trips VmState', () => {
    const file = serializeVmSave(sampleState, 2)
    const restored = deserializeVmSave(file)
    expect(restored).toEqual({
      sceneId: '教室',
      stepIndex: 3,
      variables: { affinity: 10, flag: true, name: 'hero' },
      branchQueue: [{ type: 'dialogue', character: '小雪', text: 'branch line' }]
    })
  })

  it('deserializeVmSave rejects wrong version', () => {
    const bad: VmSaveFile = {
      version: 999,
      slot: 1,
      timestamp: new Date().toISOString(),
      variables: {},
      currentSceneId: 's1',
      stepIndex: 0
    }
    expect(deserializeVmSave(bad)).toBeNull()
  })

  it('saveSlotFileName uses slot-{n}.json', () => {
    expect(saveSlotFileName(1)).toBe('slot-1.json')
    expect(saveSlotFileName(3)).toBe('slot-3.json')
  })

  it('buildWebSaveKey is stable per project', () => {
    expect(buildWebSaveKey('my-game')).toBe('galide-save-my-game')
    expect(buildWebSaveKey('my-game', 2)).toBe('galide-save-my-game-slot-2')
  })

  it('round-trips branchQueue undefined', () => {
    const state: VmState = { sceneId: 's1', stepIndex: 0, variables: {} }
    const file = serializeVmSave(state, 1)
    const restored = deserializeVmSave(file)
    expect(restored?.branchQueue).toBeUndefined()
  })

  it('preserves complex branchQueue steps', () => {
    const queue: PlaybackStep[] = [
      { type: 'set', name: 'x', op: 'add', value: { kind: 'literal', value: 5 } },
      { type: 'goto', target: 's2' }
    ]
    const state: VmState = { sceneId: 's1', stepIndex: 1, variables: { x: 0 }, branchQueue: queue }
    const restored = deserializeVmSave(serializeVmSave(state, 1))
    expect(restored?.branchQueue).toEqual(queue)
  })
})
