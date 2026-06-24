import { useQuery, useMutation } from '@tanstack/react-query'
import { useErrorStore } from '../store'
import { useAi } from './use-ai'

type Provider = 'openai' | 'claude'

export type AiTask = {
  id: string
  prompt: string
  context: string
  provider: Provider
  status: 'pending' | 'streaming' | 'done' | 'error'
  text: string
  createdAt: number
}

export const useAiTask = () => {
  const ai = useAi()
  return {
    generate: useMutation({
      mutationFn: (req: { prompt: string; context: string; provider: Provider }) =>
        ai.generate(req)
    })
  }
}

export const useAiProviders = () => {
  return useQuery({
    queryKey: ['ai-providers'],
    queryFn: async () => {
      try {
        return await window.galide.ai.listProviders()
      } catch (err) {
        useErrorStore.getState().push({
          code: 'IPC_ERROR',
          message: err instanceof Error ? err.message : String(err),
          source: 'ai:list-providers'
        })
        return []
      }
    }
  })
}

export const useAiConfig = () => {
  return useQuery({
    queryKey: ['ai-config'],
    queryFn: async () => {
      try {
        return await window.galide.ai.getConfig()
      } catch (err) {
        useErrorStore.getState().push({
          code: 'IPC_ERROR',
          message: err instanceof Error ? err.message : String(err),
          source: 'ai:get-config'
        })
        return undefined
      }
    }
  })
}
