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

export type ImageGenerateBackgroundParams = {
  projectPath: string
  name: string
  prompt: string
  negativePrompt?: string
  provider?: 'sd' | 'dalle' | 'comfyui'
  seed?: number
  width?: number
  height?: number
}

export const useImage = () => {
  return {
    generate: useCallback(
      (req: ImageGenerateParams) =>
        wrap('image:generate', () => window.galide.image.generate(req)),
      []
    ),
    generateBackground: useCallback(
      (req: ImageGenerateBackgroundParams) =>
        wrap('image:generateBackground', () => window.galide.image.generateBackground(req)),
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
