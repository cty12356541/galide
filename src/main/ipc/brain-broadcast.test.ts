/**
 * brain-broadcast 单测 — 写入命中项目根 brain 文件才广播
 */
import { describe, it, expect, vi } from 'vitest'
import { createBrainBroadcastingWriteFile } from './brain-broadcast.js'

describe('createBrainBroadcastingWriteFile', () => {
  it('写项目根 project-brain.json → 通知', async () => {
    const notify = vi.fn()
    const writes: string[] = []
    const writeFile = createBrainBroadcastingWriteFile('/proj', async (p) => { writes.push(p) }, notify)
    await writeFile('/proj/project-brain.json', '{}')
    expect(writes).toEqual(['/proj/project-brain.json'])
    expect(notify).toHaveBeenCalledWith('/proj')
  })

  it('写其他文件 / 嵌套同名文件 → 不通知', async () => {
    const notify = vi.fn()
    const writeFile = createBrainBroadcastingWriteFile('/proj', async () => {}, notify)
    await writeFile('/proj/scripts/a.gal', 'x')
    await writeFile('/proj/sub/project-brain.json', '{}')
    await writeFile('/other/project-brain.json', '{}')
    expect(notify).not.toHaveBeenCalled()
  })

  it('projectPath 支持函数形式(agent 运行时可切项目)', async () => {
    const notify = vi.fn()
    let root = '/proj-a'
    const writeFile = createBrainBroadcastingWriteFile(() => root, async () => {}, notify)
    await writeFile('/proj-a/project-brain.json', '{}')
    root = '/proj-b'
    await writeFile('/proj-b/project-brain.json', '{}')
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenLastCalledWith('/proj-b')
  })

  it('底层写失败 → 抛错且不广播', async () => {
    const notify = vi.fn()
    const writeFile = createBrainBroadcastingWriteFile(
      '/proj',
      async () => { throw new Error('disk full') },
      notify
    )
    await expect(writeFile('/proj/project-brain.json', '{}')).rejects.toThrow('disk full')
    expect(notify).not.toHaveBeenCalled()
  })
})
