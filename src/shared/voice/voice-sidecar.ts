/**
 * Voice sidecar — assets/voice/{lineId}.meta.json
 * 持久化 text/characterId,供 VoicePanel regenerate 与 voice:list 回填。
 */
import { join } from 'node:path'

export type VoiceSidecarMeta = {
  text: string
  characterId: string
}

/** P0: 防御路径遍历与目录注入 */
const validateLineId = (lineId: string): void => {
  if (lineId.length === 0) {
    throw new Error('lineId must be non-empty')
  }
  // 拦截路径遍历、绝对路径、Windows 驱动器、URL 编码、null byte
  if (
    lineId.includes('..') ||
    lineId.includes('\\') ||
    lineId.includes('/') ||
    lineId.includes(':') ||
    lineId.includes('%') ||
    lineId.includes('\0')
  ) {
    throw new Error('lineId contains path traversal')
  }
}

export const voiceSidecarRelPath = (lineId: string): string => {
  validateLineId(lineId)
  return `assets/voice/${lineId}.meta.json`
}

export const voiceSidecarAbsPath = (projectPath: string, lineId: string): string => {
  validateLineId(lineId)
  return join(projectPath, voiceSidecarRelPath(lineId))
}

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
