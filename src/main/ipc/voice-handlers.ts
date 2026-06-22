import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import { createTtsProxy } from '../voice/tts-proxy.js'
import { getPreference } from '../preferences/preferences-store.js'
import type { VoiceConfig } from '../../shared/types.js'
import {
  parseIpcArgs,
  VoiceDeleteSchema,
  VoiceGenerateSchema,
  VoiceListSchema,
  VoicePreviewSchema
} from './schemas/index.js'
import {
  parseVoiceSidecar,
  serializeVoiceSidecar,
  voiceSidecarAbsPath
} from '../../shared/voice/voice-sidecar.js'

const tts = createTtsProxy()

const readCharacterVoiceConfig = async (
  projectPath: string,
  characterId: string
): Promise<VoiceConfig | undefined> => {
  if (!characterId) return undefined
  try {
    const raw = await fs.readFile(join(projectPath, '.galproj'), 'utf-8')
    const parsed = JSON.parse(raw) as {
      characters?: Array<{ id: string; voiceConfig?: VoiceConfig }>
    }
    return parsed.characters?.find((c) => c.id === characterId)?.voiceConfig
  } catch {
    return undefined
  }
}

const writeVoiceSidecar = async (
  projectPath: string,
  lineId: string,
  text: string,
  characterId: string
): Promise<void> => {
  const metaPath = voiceSidecarAbsPath(projectPath, lineId)
  await fs.writeFile(metaPath, serializeVoiceSidecar({ text, characterId }), 'utf-8')
}

export const registerVoiceHandlers = (): void => {
  ipcMain.handle(
    IPC.voice.generate,
    async (_e, projectPath: string, lineId: string, text: string, characterId: string) => {
      const args = parseIpcArgs('voice:generate', VoiceGenerateSchema, {
        projectPath,
        lineId,
        text,
        characterId
      })
      try {
        const dir = join(args.projectPath, 'assets', 'voice')
      await fs.mkdir(dir, { recursive: true })
      const path = join(dir, `${args.lineId}.mp3`)
      const voicePrefs = getPreference('voice')
      const voiceConfig = await readCharacterVoiceConfig(args.projectPath, args.characterId)
      const result = await tts.generate(
        args.text,
        args.characterId,
        path,
        voicePrefs,
        voiceConfig
      )
      if (result.ok === false) {
        return { ok: false as const, code: result.code, error: result.message }
      }
      await writeVoiceSidecar(args.projectPath, args.lineId, args.text, args.characterId)
      return { ok: true as const, path: `assets/voice/${args.lineId}.mp3` }
    } catch (err) {
      return {
        ok: false as const,
        code: 'GENERATION_FAILED' as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  }
  )

  ipcMain.handle(
    IPC.voice.preview,
    async (_e, text: string, provider: string, voiceId: string) => {
      const args = parseIpcArgs('voice:preview', VoicePreviewSchema, { text, provider, voiceId })
      try {
        const voicePrefs = getPreference('voice')
        const result = await tts.preview(args.text, args.provider, args.voiceId, voicePrefs)
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
    }
  )

  ipcMain.handle(IPC.voice.list, async (_e, projectPath: string) => {
    const args = parseIpcArgs('voice:list', VoiceListSchema, { projectPath })
    try {
      const dir = join(args.projectPath, 'assets', 'voice')
      const files = await fs.readdir(dir)
      const items = await Promise.all(
        files
          .filter((f) => f.endsWith('.mp3'))
          .map(async (f) => {
            const id = f.replace(/\.mp3$/, '')
            let text = ''
            let characterId = ''
            try {
              const metaRaw = await fs.readFile(voiceSidecarAbsPath(args.projectPath, id), 'utf-8')
              const meta = parseVoiceSidecar(metaRaw)
              if (meta) {
                text = meta.text
                characterId = meta.characterId
              }
            } catch {
              // sidecar optional for legacy files
            }
            return {
              id,
              text,
              audioPath: `assets/voice/${f}`,
              characterId
            }
          })
      )
      return { ok: true, items }
    } catch (err) {
      const isNotFound =
        err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
      if (!isNotFound) {
        console.warn(`[galide voice] 列出 ${args.projectPath}/assets/voice 失败`, err)
      }
      return { ok: true, items: [] }
    }
  })

  ipcMain.handle(IPC.voice.delete, async (_e, projectPath: string, lineId: string) => {
    const args = parseIpcArgs('voice:delete', VoiceDeleteSchema, { projectPath, lineId })
    try {
      const path = join(args.projectPath, 'assets', 'voice', `${args.lineId}.mp3`)
      await fs.unlink(path)
      try {
        await fs.unlink(voiceSidecarAbsPath(args.projectPath, args.lineId))
      } catch {
        // meta may not exist
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
