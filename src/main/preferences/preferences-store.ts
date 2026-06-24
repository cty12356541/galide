import Store from 'electron-store'
import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type {
  AdvancedPreferences,
  AgentPreferences,
  AppearancePreferences,
  EditorPreferences,
  ExportPreferences,
  GitPreferences,
  ProjectPreferences,
  Shortcuts,
  VoicePreferences
} from '../../shared/preferences.js'

/**
 * 偏好持久化 - electron-store 普通配置(非加密)
 * API Key 单独存放在 key-store.ts 加密 store
 */

type PreferencesShape = {
  voice: VoicePreferences
  agent: AgentPreferences
  editor: EditorPreferences
  appearance: AppearancePreferences
  export: ExportPreferences
  git: GitPreferences
  project: ProjectPreferences
  advanced: AdvancedPreferences
}

const DEFAULTS: PreferencesShape = {
  voice: {
    defaultProvider: 'edge',
    defaultVoiceId: 'zh-CN-XiaoxiaoNeural',
    batchConcurrency: 4,
    previewEnabled: false
  },
  agent: {
    autonomy: 'hybrid',
    topology: 'litePlanExecute',
    maxSteps: 30,
    memoryEnabled: true,
    memoryEntries: 8
  },
  editor: {
    fontSize: 14,
    tabSize: 2,
    wordWrap: true,
    lineNumbers: true,
    minimap: false
  },
  appearance: {
    accent: 'violet',
    fontSans: 'Inter',
    fontMono: 'JetBrains Mono',
    reducedMotion: false
  },
  export: {
    defaultTarget: 'web',
    defaultOutputDir: '',
    includeAssets: true
  },
  git: {
    autoInit: true,
    autoCommitOnSave: false,
    defaultAuthorName: '',
    defaultAuthorEmail: '',
    initialCommitMessage: 'initial commit'
  },
  project: {
    recentLimit: 10,
    defaultTemplate: ''
  },
  advanced: {
    telemetry: false,
    experimental: false,
    cacheDir: ''
  }
}

let storeInstance: Store<PreferencesShape & { shortcuts: Shortcuts }> | null = null

export const getPreferencesStore = (): Store<PreferencesShape & { shortcuts: Shortcuts }> => {
  if (!storeInstance) {
    storeInstance = new Store<PreferencesShape & { shortcuts: Shortcuts }>({
      name: 'galide-preferences',
      cwd: app.getPath('userData'),
      defaults: { ...DEFAULTS, shortcuts: {} }
    })
  }
  return storeInstance
}

export const getPreference = <K extends keyof PreferencesShape>(key: K): PreferencesShape[K] => {
  return getPreferencesStore().get(key)
}

export const setPreference = <K extends keyof PreferencesShape>(
  key: K,
  value: PreferencesShape[K]
): void => {
  getPreferencesStore().set(key, value)
}

export const resetPreference = (key: keyof PreferencesShape): void => {
  getPreferencesStore().set(key, DEFAULTS[key])
}

export const resetAllPreferences = (): void => {
  const s = getPreferencesStore()
  for (const key of Object.keys(DEFAULTS) as Array<keyof PreferencesShape>) {
    s.set(key, DEFAULTS[key])
  }
  s.set('shortcuts', {})
}

export const getShortcuts = (): Shortcuts => {
  return getPreferencesStore().get('shortcuts')
}

export const setShortcuts = (shortcuts: Shortcuts): void => {
  getPreferencesStore().set('shortcuts', shortcuts)
}

export const resetShortcuts = (): void => {
  getPreferencesStore().set('shortcuts', {})
}

/**
 * 缓存目录(默认 <userData>/cache)
 * 供 advanced 面板显示与"清理缓存"使用
 */
export const getCacheDir = (): string => {
  const stored = getPreferencesStore().get('advanced').cacheDir
  if (stored && stored.trim()) return stored
  // 规约:不依赖 electron 的 'cache' 路径(electron 30 types 联合不含 'cache');
  // 用 userData 派生 cache 子目录,跨平台一致。
  return join(app.getPath('userData'), 'cache', 'galide')
}

/**
 * 清理缓存目录内容(只删 cache/ 下文件/子目录,不删 cache/ 自身)
 * 返回删除的文件/目录数量
 */
export const clearCache = async (): Promise<{ ok: boolean; removed: number; error?: string }> => {
  const dir = getCacheDir()
  try {
    const entries = await fs.readdir(dir)
    let removed = 0
    for (const name of entries) {
      const p = join(dir, name)
      try {
        const stat = await fs.lstat(p)
        if (stat.isDirectory()) {
          await fs.rm(p, { recursive: true, force: true })
        } else {
          await fs.unlink(p)
        }
        removed++
      } catch (err) {
        // 单个文件失败不阻断整体清理
        console.warn(`[galide preferences] 删除缓存项失败: ${p}`, err)
      }
    }
    return { ok: true, removed }
  } catch (err) {
    const isNotFound =
      err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT'
    if (isNotFound) return { ok: true, removed: 0 }
    return { ok: false, removed: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
