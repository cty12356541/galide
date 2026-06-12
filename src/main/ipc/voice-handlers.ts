import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { ttsProxy } from '../voice/tts-proxy.js'

export const registerVoiceHandlers = (): void => {
  ipcMain.handle(
    IPC.voice.generate,
    async (_e, projectPath: string, lineId: string, text: string, characterId: string) => {
      try {
        const dir = join(projectPath, 'assets', 'voice')
        await fs.mkdir(dir, { recursive: true })
        const path = join(dir, `${lineId}.mp3`)
        const result = await ttsProxy.generate(text, characterId, path)
        if (result.ok === false) {
          return { ok: false as const, code: result.code, error: result.message }
        }
        return { ok: true as const, path: `assets/voice/${lineId}.mp3` }
      } catch (err) {
        return {
          ok: false as const,
          code: 'GENERATION_FAILED' as const,
          error: err instanceof Error ? err.message : String(err)
        }
      }
    }
  )

  ipcMain.handle(IPC.voice.preview, async (_e, text: string, provider: string, voiceId: string) => {
    try {
      const result = await ttsProxy.preview(text, provider, voiceId)
      if (result.ok === false) {
        return { ok: false as const, code: result.code, error: result.message }
      }
      return { ok: true as const, url: '' }
    } catch (err) {
      return {
        ok: false as const,
        code: 'GENERATION_FAILED' as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle(IPC.voice.list, async (_e, projectPath: string) => {
    try {
      const dir = join(projectPath, 'assets', 'voice')
      const files = await fs.readdir(dir)
      return {
        ok: true,
        items: files
          .filter((f) => f.endsWith('.mp3'))
          .map((f) => ({
            id: f.replace(/\.mp3$/, ''),
            text: '',
            audioPath: `assets/voice/${f}`,
            characterId: ''
          }))
      }
    } catch (err) {
      // P1-6 修复: voice dir 不存在是常见情况(项目刚建),但 readdir 失败也可能因 IO 错误
      // 区分两类错误:ENOENT → 空 list 静默;其他 → 留 warn
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
      if (!isNotFound) {
        console.warn(`[galide voice] 列出 ${projectPath}/assets/voice 失败`, err)
      }
      return { ok: true, items: [] }
    }
  })

  ipcMain.handle(IPC.voice.delete, async (_e, projectPath: string, lineId: string) => {
    try {
      const path = join(projectPath, 'assets', 'voice', `${lineId}.mp3`)
      await fs.unlink(path)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
