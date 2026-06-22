/**
 * Voice sidecar — assets/voice/{lineId}.meta.json
 * 持久化 text/characterId,供 VoicePanel regenerate 与 voice:list 回填。
 */
import { join } from 'node:path'

export type VoiceSidecarMeta = {
  text: string
  characterId: string
}

export const voiceSidecarRelPath = (lineId: string): string => `assets/voice/${lineId}.meta.json`

export const voiceSidecarAbsPath = (projectPath: string, lineId: string): string =>
  join(projectPath, voiceSidecarRelPath(lineId))

export const parseVoiceSidecar = (raw: string): VoiceSidecarMeta | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<VoiceSidecarMeta>
    if (typeof parsed.text !== 'string' || typeof parsed.characterId !== 'string') return null
    return { text: parsed.text, characterId: parsed.characterId }
  } catch {
    return null
  }
}

export const serializeVoiceSidecar = (meta: VoiceSidecarMeta): string =>
  JSON.stringify(meta, null, 2) + '\n'
