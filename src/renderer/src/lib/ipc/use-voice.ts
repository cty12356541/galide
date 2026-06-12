import { useCallback } from 'react'
import { useErrorStore } from '../store'

export const useVoice = () => {
  return {
    generate: useCallback(
      (projectPath: string, lineId: string, text: string, characterId: string) =>
        wrap('voice:generate', () =>
          window.galide.voice.generate(projectPath, lineId, text, characterId)
        ),
      []
    ),
    preview: useCallback(
      (text: string, provider: string, voiceId: string) =>
        wrap('voice:preview', () => window.galide.voice.preview(text, provider, voiceId)),
      []
    ),
    list: useCallback(
      (projectPath: string) => wrap('voice:list', () => window.galide.voice.list(projectPath)),
      []
    ),
    delete: useCallback(
      (projectPath: string, lineId: string) =>
        wrap('voice:delete', () => window.galide.voice.delete(projectPath, lineId)),
      []
    )
  }
}

const wrap = async <T>(source: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      source
    })
    return undefined
  }
}
