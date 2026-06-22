/**
 * script-broadcast — agent / IPC 共用 script:changed 广播
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC } from '../../shared/ipc-channels.js'
import { createBroadcastingWriteFile, broadcastScriptChanged } from './script-broadcast.js'

const mockSend = vi.fn()
const mockWindows = [
  { isDestroyed: () => false, webContents: { id: 1, send: mockSend } },
  { isDestroyed: () => false, webContents: { id: 2, send: mockSend } }
]

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => mockWindows }
}))

describe('script-broadcast', () => {
  beforeEach(() => {
    mockSend.mockClear()
  })

  it('broadcastScriptChanged notifyAll 通知全部窗口', () => {
    broadcastScriptChanged(
      { projectPath: '/proj', fileName: 'chapter1.gal', source: '## s\n' },
      { notifyAll: true }
    )
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith(IPC.script.changed, {
      projectPath: '/proj',
      fileName: 'chapter1.gal',
      source: '## s\n'
    })
  })

  it('broadcastScriptChanged excludeSenderId 跳过发送者', () => {
    broadcastScriptChanged(
      { projectPath: '/proj', fileName: 'a.gal', source: 'x' },
      { excludeSenderId: 1 }
    )
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('createBroadcastingWriteFile 写 .gal 后触发广播', async () => {
    const writes: Array<{ path: string; content: string }> = []
    const broadcasts: Array<{ projectPath: string; fileName: string; source: string }> = []
    const writeFile = async (path: string, content: string) => {
      writes.push({ path, content })
    }
    const broadcast = vi.fn((payload) => {
      broadcasts.push(payload)
    })
    const wrapped = createBroadcastingWriteFile('/proj', writeFile, broadcast)
    await wrapped('/proj/scripts/chapter1.gal', '## intro\n')
    expect(writes).toHaveLength(1)
    expect(broadcasts).toEqual([
      { projectPath: '/proj', fileName: 'chapter1.gal', source: '## intro\n' }
    ])
  })

  it('createBroadcastingWriteFile 非 .gal 不广播', async () => {
    const broadcast = vi.fn()
    const wrapped = createBroadcastingWriteFile('/proj', async () => {}, broadcast)
    await wrapped('/proj/readme.txt', 'hello')
    expect(broadcast).not.toHaveBeenCalled()
  })
})
