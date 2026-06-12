import { useQuery } from '@tanstack/react-query'
import { useErrorStore } from '../store'

type GitStatus = {
  initialized: boolean
  current: string | null
  files: { path: string; index: string; working_dir: string }[]
}

export const useGitStatus = (projectPath: string | null) => {
  return useQuery<GitStatus>({
    queryKey: ['git-status', projectPath],
    queryFn: async () => {
      if (!projectPath) {
        return { initialized: false, current: null, files: [] }
      }
      try {
        return await window.galide.git.status(projectPath)
      } catch (err) {
        useErrorStore.getState().push({
          code: 'IPC_ERROR',
          message: err instanceof Error ? err.message : String(err),
          source: 'git:status'
        })
        return { initialized: false, current: null, files: [] }
      }
    },
    enabled: projectPath !== null,
    refetchInterval: 10000
  })
}
