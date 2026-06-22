import { useCallback } from 'react'
import { useErrorStore } from '../store'

export type ImageGenerateParams = {
  projectPath: string
  characterId: string
  state: string
  prompt: string
  provider?: 'sd' | 'dalle' | 'comfyui'
  seed?: number
  baseUrl?: string
}

export const useImage = () => {
  return {
    generate: useCallback(
      (req: ImageGenerateParams) =>
        wrap('image:generate', () => window.galide.image.generate(req)),
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
