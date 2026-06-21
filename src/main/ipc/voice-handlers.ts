import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { createTtsProxy } from '../voice/tts-proxy.js'
import { getPreference } from '../preferences/preferences-store.js'

const tts = createTtsProxy()

export const registerVoiceHandlers = (): void => {
  ipcMain.handle(
    IPC.voice.generate,
    async (_e, projectPath: string, lineId: string, text: string, characterId: string) => {
      try {
        const dir = join(projectPath, 'assets', 'voice')
        await fs.mkdir(dir, { recursive: true })
        const path = join(dir, `${lineId}.mp3`)
        const voicePrefs = getPreference('voice')
        const result = await tts.generate(text, characterId, path, voicePrefs)
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
      const voicePrefs = getPreference('voice')
      const result = await tts.preview(text, provider, voiceId, voicePrefs)
      if (result.ok === false) {
        return { ok: false as const, code: result.code, error: result.message }
      }
      return { ok: true as const, url: result.path }
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
