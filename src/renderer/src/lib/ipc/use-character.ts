import { useCallback } from 'react'
import { useErrorStore } from '../store'

type CharacterInput = {
  id: string
  name: string
  description: string
  personality: string
  spriteSet: { state: string; path: string }[]
}

export const useCharacter = () => {
  return {
    create: useCallback(
      (projectPath: string, character: CharacterInput) =>
        wrap('character:create', () => window.galide.character.create(projectPath, character)),
      []
    ),
    update: useCallback(
      (projectPath: string, character: CharacterInput) =>
        wrap('character:update', () => window.galide.character.update(projectPath, character)),
      []
    ),
    list: useCallback(
      (projectPath: string) => wrap('character:list', () => window.galide.character.list(projectPath)),
      []
    ),
    delete: useCallback(
      (projectPath: string, id: string) =>
        wrap('character:delete', () => window.galide.character.delete(projectPath, id)),
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
