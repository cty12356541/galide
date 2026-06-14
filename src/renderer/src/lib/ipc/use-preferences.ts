import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useErrorStore } from '../store'
import type { PreferencesSection, Shortcuts } from '@shared/preferences'

const PREF_KEYS = [
  'voice',
  'editor',
  'appearance',
  'export',
  'git',
  'project',
  'advanced'
] as const

type PrefKey = (typeof PREF_KEYS)[number]

/**
 * 通用偏好读取 hook - 直接 useQuery,符合 React Query 模式
 * 规约 server state → React Query
 */
export const usePreference = <K extends PrefKey>(key: K) => {
  return useQuery({
    queryKey: ['preferences', key] as const,
    // P0-10 修复(2026-06-15): 通过 Window.galide 强类型 + PrefKey 泛型让 data
    //   自动收窄到具体 preference 类型(appearance / ai / editor / ...),
    //   而不是 unknown — use-appearance-effect 才能 access .accent 等字段
    queryFn: () => {
      const g = window.galide
      // 无 window.galide 时(SSR/test)返回 null
      if (!g) return Promise.resolve(null)
      return g.preferences.get(key)
    }
  })
}

export const useSavePreference = <K extends PrefKey>(key: K) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (value: unknown) => window.galide.preferences.set(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['preferences', key] })
  })
}

export const useResetAllPreferences = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.galide.preferences.reset(),
    onSuccess: () => {
      for (const k of PREF_KEYS) qc.invalidateQueries({ queryKey: ['preferences', k] })
      qc.invalidateQueries({ queryKey: ['shortcuts'] })
    }
  })
}

export const useSectionReset = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (section: PreferencesSection) => window.galide.preferences.sectionReset(section),
    onSuccess: (_data, section) => {
      if (section === 'shortcuts') {
        qc.invalidateQueries({ queryKey: ['shortcuts'] })
      } else {
        qc.invalidateQueries({ queryKey: ['preferences', section] })
      }
    }
  })
}

export const useShortcuts = (): ReturnType<typeof useQuery<Shortcuts>> => {
  return useQuery<Shortcuts>({
    queryKey: ['shortcuts'],
    queryFn: () => window.galide.shortcuts.get()
  })
}

export const useSaveShortcuts = () => {
  const qc = useQueryClient()
  const pushError = useErrorStore((s) => s.push)
  return useMutation({
    mutationFn: (shortcuts: Shortcuts) => window.galide.shortcuts.set(shortcuts),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shortcuts'] }),
    onError: (err: Error) => {
      pushError({ code: 'SHORTCUTS_SAVE_FAILED', message: err.message, source: 'shortcuts:set' })
    }
  })
}

export const useResetShortcuts = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => window.galide.shortcuts.reset(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shortcuts'] })
  })
}

export const useCacheDir = () => {
  return useQuery({
    queryKey: ['preferences', 'cacheDir'],
    queryFn: () => window.galide.preferences.getCacheDir()
  })
}

export const useClearCache = () => {
  const pushError = useErrorStore((s) => s.push)
  return useMutation({
    mutationFn: () => window.galide.preferences.clearCache(),
    onError: (err: Error) => {
      pushError({
        code: 'CLEAR_CACHE_FAILED',
        message: err.message,
        source: 'preferences:clearCache'
      })
    }
  })
}
