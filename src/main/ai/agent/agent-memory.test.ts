/**
 * agent-memory 单测 — 项目级跨会话记忆读写
 * 磁盘用 memfs(禁止 mock fs)。
 */
import { describe, it, expect } from 'vitest'
import { createFsFromVolume, Volume } from 'memfs'
import { readMemory, appendMemory, formatMemoryText, memoryPath } from './agent-memory.js'
import type { MemoryFs } from './agent-memory.js'

const makeFs = (files: Record<string, string> = {}): MemoryFs => {
  const vol = Volume.fromJSON(files)
  const mfs = createFsFromVolume(vol)
  return {
    readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
    writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>
  }
}

describe('agent-memory', () => {
  it('readMemory 无文件 → 空记忆', async () => {
    const fs = makeFs()
    const m = await readMemory('/proj', fs)
    expect(m.entries).toHaveLength(0)
  })

  it('readMemory 损坏 JSON → 空记忆(不抛错)', async () => {
    const fs = makeFs({ '/proj/.galide/agent-memory.json': '{not json' })
    const m = await readMemory('/proj', fs)
    expect(m.entries).toHaveLength(0)
  })

  it('appendMemory 写入并环截断到 capacity', async () => {
    const vol = Volume.fromJSON({})
    const mfs = createFsFromVolume(vol)
    const fs: MemoryFs = {
      readFile: (p) => mfs.promises.readFile(p, 'utf-8') as Promise<string>,
      writeFile: (p, c) => mfs.promises.writeFile(p, c) as Promise<void>,
      mkdir: (p, o) => mfs.promises.mkdir(p, o) as Promise<unknown>
    }
    for (let i = 0; i < 5; i++) {
      await appendMemory('/proj', {
        goal: `目标${i}`,
        finalText: `结论${i}`,
        status: 'done',
        timestamp: `2026-01-0${i + 1}`
      }, fs, 3)
    }
    const m = await readMemory('/proj', fs)
    expect(m.entries).toHaveLength(3)
    // FIFO:保留最后 3 条(目标2/3/4)
    expect(m.entries[0]?.goal).toBe('目标2')
    expect(m.entries[2]?.goal).toBe('目标4')
  })

  it('appendMemory 写入失败静默(不抛错)', async () => {
    const fs: MemoryFs = {
      readFile: async () => { throw new Error('boom') },
      writeFile: async () => { throw new Error('disk full') }
    }
    await expect(
      appendMemory('/proj', { goal: 'g', finalText: 'f', status: 'done', timestamp: 't' }, fs)
    ).resolves.toBeUndefined()
  })

  it('formatMemoryText 拼装历史,finalText 截断 280 字符', async () => {
    const m = {
      entries: [
        { goal: '加场景', finalText: '已完成', status: 'done' as const, timestamp: 't1' },
        { goal: '删对白', finalText: '', status: 'cancelled' as const, timestamp: 't2' }
      ]
    }
    const text = formatMemoryText(m)
    expect(text).toContain('[done] 加场景 → 已完成')
    expect(text).toContain('[cancelled] 删对白')
  })

  it('formatMemoryText 空记忆 → 空串', () => {
    expect(formatMemoryText({ entries: [] })).toBe('')
  })

  it('memoryPath 落在 .galide/', () => {
    expect(memoryPath('/proj')).toBe('/proj/.galide/agent-memory.json')
  })
})
