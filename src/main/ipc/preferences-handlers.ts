import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import {
  getPreference,
  setPreference,
  resetPreference,
  resetAllPreferences,
  getShortcuts,
  setShortcuts,
  resetShortcuts,
  getCacheDir,
  clearCache
} from '../preferences/preferences-store.js'
import type { PreferencesSection, Shortcuts } from '../../shared/preferences.js'

type PrefKey = 'voice' | 'editor' | 'appearance' | 'export' | 'git' | 'project' | 'advanced'

const VALID_KEYS: readonly PrefKey[] = [
  'voice',
  'editor',
  'appearance',
  'export',
  'git',
  'project',
  'advanced'
] as const

const isPrefKey = (s: string): s is PrefKey =>
  (VALID_KEYS as readonly string[]).includes(s)

export const registerPreferencesHandlers = (): void => {
  ipcMain.handle(IPC.preferences.get, async (_e: IpcMainInvokeEvent, key: string): Promise<unknown> => {
    if (!isPrefKey(key)) {
      throw new Error(`preferences.get: unknown key "${key}"`)
    }
    return getPreference(key)
  })

  ipcMain.handle(
    IPC.preferences.set,
    async (_e: IpcMainInvokeEvent, key: string, value: unknown): Promise<{ ok: boolean }> => {
      if (!isPrefKey(key)) {
        throw new Error(`preferences.set: unknown key "${key}"`)
      }
      // IPC 边界 value 是 unknown,实际类型由 preferences-store.setPreference 内部
      // (PreferencesShape[K]) 在运行时校验 schema — 此处用 unknown→never 收口是规约
      // 允许的"强类型边界收口"模式(languages/typescript/conventions.yaml:18-22)
      setPreference(key, value as never)
      return { ok: true }
    }
  )

  ipcMain.handle(IPC.preferences.reset, async (): Promise<{ ok: boolean }> => {
    resetAllPreferences()
    return { ok: true }
  })

  ipcMain.handle(
    IPC.preferences.sectionReset,
    async (_e: IpcMainInvokeEvent, section: PreferencesSection): Promise<{ ok: boolean }> => {
      if (section === 'shortcuts') {
        resetShortcuts()
      } else if (section === 'ai') {
        // AI section has no plain preferences (Key/config handled by ai-handlers)
      } else if (isPrefKey(section)) {
        resetPreference(section)
      } else {
        throw new Error(`preferences.sectionReset: unknown section "${section}"`)
      }
      return { ok: true }
    }
  )

  ipcMain.handle(IPC.shortcuts.get, async (): Promise<Shortcuts> => {
    return getShortcuts()
  })

  ipcMain.handle(
    IPC.shortcuts.set,
    async (_e: IpcMainInvokeEvent, shortcuts: Shortcuts): Promise<{ ok: boolean }> => {
      setShortcuts(shortcuts)
      return { ok: true }
    }
  )

  ipcMain.handle(IPC.shortcuts.reset, async (): Promise<{ ok: boolean }> => {
    resetShortcuts()
    return { ok: true }
  })

  ipcMain.handle(IPC.preferences.cacheDir, async (): Promise<string> => {
    return getCacheDir()
  })

  ipcMain.handle(
    IPC.preferences.clearCache,
    async (): Promise<{ ok: boolean; removed: number; error?: string }> => {
      return clearCache()
    }
  )
}
