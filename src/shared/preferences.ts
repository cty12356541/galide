/**
 * 用户偏好类型(全应用统一)
 * 业务类型对齐 core/naming.yaml entities,工具抽象用 Preferences 后缀
 */

export type VoicePreferences = {
  defaultProvider: 'edge' | 'elevenlabs' | 'local'
  defaultVoiceId: string
  batchConcurrency: number
}

export type EditorPreferences = {
  fontSize: number
  tabSize: number
  wordWrap: boolean
  lineNumbers: boolean
  minimap: boolean
}

export type AppearancePreferences = {
  accent: 'violet' | 'blue' | 'rose' | 'emerald'
  fontSans: string
  fontMono: string
  reducedMotion: boolean
}

export type ExportPreferences = {
  defaultTarget: 'web' | 'renpy' | 'ink' | 'json' | 'electron-desktop'
  defaultOutputDir: string
  includeAssets: boolean
}

export type GitPreferences = {
  autoInit: boolean
  autoCommitOnSave: boolean
  defaultAuthorName: string
  defaultAuthorEmail: string
  initialCommitMessage: string
}

export type ProjectPreferences = {
  recentLimit: number
  defaultTemplate: string
}

export type ShortcutBinding = {
  id: string
  label: string
  accelerator: string
  default: string
}

export type Shortcuts = Record<string, string>

export type AdvancedPreferences = {
  telemetry: boolean
  experimental: boolean
  cacheDir: string
}

export type PreferencesSection =
  | 'ai'
  | 'voice'
  | 'editor'
  | 'export'
  | 'appearance'
  | 'git'
  | 'project'
  | 'shortcuts'
  | 'advanced'

export type AiProviderForm = {
  id: 'openai' | 'claude' | 'ollama'
  label: string
  hasKey: boolean
  model: string
  baseUrl: string
}
