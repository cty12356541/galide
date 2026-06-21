/**
 * preview-service 单测 — memfs 存档读写
 */
import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import { join } from 'node:path'
import { loadPreviewSlot, savePreviewSlot, listPreviewSlots } from './preview-service.js'
import type { PreviewFs } from './preview-service.js'
import type { VmState } from '../../shared/preview/runtime-vm.js'

const makeFs = (): { fs: PreviewFs; projectPath: string } => {
  const vol = Volume.fromJSON({})
  const mfs = createFsFromVolume(vol)
  const fs: PreviewFs = {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
    mkdir: (p, opts) => mfs.promises.mkdir(p, opts) as Promise<void | string>,
    readdir: (p) => mfs.promises.readdir(p) as Promise<string[]>
  }
  return { fs, projectPath: '/proj' }
}

const sampleState: VmState = {
  sceneId: '教室',
  stepIndex: 2,
  variables: { affinity: 15 }
}

describe('preview-service', () => {
  it('savePreviewSlot writes .galide/saves/slot-1.json', async () => {
    const { fs, projectPath } = makeFs()
    const r = await savePreviewSlot(projectPath, 1, sampleState, fs)
    expect(r.ok).toBe(true)
    const raw = await fs.readFile(join(projectPath, '.galide/saves/slot-1.json'))
    expect(raw).toContain('"affinity": 15')
    expect(raw).toContain('"currentSceneId": "教室"')
  })

  it('loadPreviewSlot restores VmState round-trip', async () => {
    const { fs, projectPath } = makeFs()
    await savePreviewSlot(projectPath, 2, sampleState, fs)
    const r = await loadPreviewSlot(projectPath, 2, fs)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state).toEqual(sampleState)
  })

  it('listPreviewSlots reports occupied slots', async () => {
    const { fs, projectPath } = makeFs()
    await savePreviewSlot(projectPath, 1, sampleState, fs)
    const slots = await listPreviewSlots(projectPath, fs)
    expect(slots).toHaveLength(3)
    expect(slots[0]?.occupied).toBe(true)
    expect(slots[1]?.occupied).toBe(false)
  })

  it('rejects invalid slot number', async () => {
    const { fs, projectPath } = makeFs()
    const r = await savePreviewSlot(projectPath, 0, sampleState, fs)
    expect(r.ok).toBe(false)
  })
})
