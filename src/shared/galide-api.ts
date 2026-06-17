/**
 * GalideApi 类型声明
 *
 * P1-23 修复: 此前 GalideApi 在 src/preload/index.ts 里 export type,
 * renderer 端 import type 引到 .js 路径 + tsconfig.web 没列 preload 时编译失败。
 *
 * 拆到 shared/ 后:
 * - preload 引用 shared 源类型,contextBridge.exposeInMainWorld 包装 API
 * - renderer 端通过 type-only import 引 GalideApi,无运行时依赖
 *
 * 类型与 preload 实际暴露的字段保持 1:1(src/preload/index.ts 仍负责运行时实现)
 */
import type { ProjectManifest, ProjectOpenResult } from './types.js'
import type { Result, ScriptNode, ParseError } from './dsl/types.js'

export type GitStatus = {
  initialized: boolean
  current: string | null
  files: { path: string; index: string; working_dir: string }[]
}

export type GitCommit = {
  hash: string
  date: string
  message: string
  author: string
}

export type CharacterInput = {
  id: string
  name: string
  description: string
  personality: string
  spriteSet: { state: string; path: string }[]
}

export type CharacterListResult = {
  ok: boolean
  characters?: CharacterInput[]
  error?: string
}

export type AiConfig = {
  provider: 'openai' | 'claude' | 'ollama'
  baseUrl?: string
  model?: string
}

export type AiProviderInfo = {
  id: 'openai' | 'claude' | 'ollama'
  name: string
  models: string[]
}

export type AiTaskStatus = 'pending' | 'running' | 'done' | 'error'

export type AiTaskInfo = {
  taskId: string
  status: AiTaskStatus
  prompt: string
  provider: 'openai' | 'claude' | 'ollama'
  error?: string
  createdAt: number
}

export type AiStreamChunk = {
  taskId: string
  delta: string
}

export type AiTaskStatusEvent = {
  taskId: string
  status: AiTaskStatus
  error?: string
}

export type AssetResolveResult = {
  ok: boolean
  dataUrl?: string
  absolutePath?: string
  mime?: string
  size?: number
  isDataUrl?: boolean
  code?: string
  error?: string
}

export type GalideApi = {
  project: {
    create: (name: string) => Promise<ProjectOpenResult>
    open: () => Promise<ProjectOpenResult>
    openPath: (projectPath: string) => Promise<ProjectOpenResult>
    save: (projectPath: string, manifest: ProjectManifest) => Promise<ProjectOpenResult>
    close: () => Promise<{ ok: true }>
    recordRecent: (entry: { path: string; name: string }) => Promise<{ ok: boolean }>
    listRecent: () => Promise<{ ok: boolean; items: { path: string; name: string; lastOpened: string }[] }>
  }
  script: {
    read: (projectPath: string, fileName: string) => Promise<string>
    write: (projectPath: string, fileName: string, content: string) => Promise<{ ok: boolean; error?: string; code?: string }>
    parse: (source: string) => Promise<Result<ScriptNode, ParseError[]>>
    list: (projectPath: string) => Promise<string[]>
  }
  git: {
    init: (projectPath: string) => Promise<{ ok: boolean }>
    status: (projectPath: string) => Promise<GitStatus>
    commit: (projectPath: string, message: string) => Promise<{ ok: boolean }>
    log: (projectPath: string) => Promise<GitCommit[]>
    diff: (projectPath: string, filePath: string) => Promise<string>
  }
  export: {
    start: (req: { projectPath: string; target: string; outputPath: string }) => Promise<{ ok: boolean; error?: string; code?: string; jobId?: string; paths?: readonly string[] }>
    cancel: (jobId: string) => Promise<{ ok: boolean; cancelled: boolean }>
    onProgress: (callback: (progress: { stage: string; progress: number; message: string; jobId?: string }) => void) => () => void
  }
  ai: {
    generate: (req: { prompt: string; context: string; provider: string; model?: string; baseUrl?: string }) => Promise<{ taskId: string; status: 'pending' }>
    cancel: (taskId: string) => Promise<{ ok: boolean; cancelled: boolean }>
    listTasks: () => Promise<{ tasks: AiTaskInfo[] }>
    stream: (callback: (chunk: AiStreamChunk) => void) => () => void
    onStatus: (callback: (status: AiTaskStatusEvent) => void) => () => void
    listProviders: () => Promise<(AiProviderInfo & { hasKey: boolean })[]>
    getConfig: () => Promise<AiConfig>
    setConfig: (config: AiConfig) => Promise<{ ok: boolean }>
    keySet: (provider: 'openai' | 'claude' | 'ollama', key: string) => Promise<{ ok: boolean }>
    keyDelete: (provider: 'openai' | 'claude' | 'ollama') => Promise<{ ok: boolean }>
    keyHas: (provider: 'openai' | 'claude' | 'ollama') => Promise<boolean>
    connectionTest: (req: { prompt: string; context: string; provider: 'openai' | 'claude' | 'ollama'; model?: string; baseUrl?: string }) => Promise<{ taskId: string; status: 'pending' } | { ok: false; error: string }>
    onConnTestStream: (callback: (chunk: AiStreamChunk) => void) => () => void
    onConnTestStatus: (callback: (status: AiTaskStatusEvent) => void) => () => void
  }
  preferences: {
    get: <K extends string>(key: K) => Promise<unknown>
    set: <K extends string>(key: K, value: unknown) => Promise<{ ok: boolean }>
    reset: () => Promise<{ ok: boolean }>
    sectionReset: (section: string) => Promise<{ ok: boolean }>
    getCacheDir: () => Promise<string>
    clearCache: () => Promise<{ ok: boolean; removed: number; error?: string }>
  }
  shortcuts: {
    get: () => Promise<Record<string, string>>
    set: (shortcuts: Record<string, string>) => Promise<{ ok: boolean }>
    reset: () => Promise<{ ok: boolean }>
  }
  character: {
    create: (projectPath: string, character: CharacterInput) => Promise<{ ok: boolean; error?: string }>
    update: (projectPath: string, character: CharacterInput) => Promise<{ ok: boolean; error?: string }>
    list: (projectPath: string) => Promise<CharacterListResult>
    delete: (projectPath: string, id: string) => Promise<{ ok: boolean; error?: string }>
  }
  voice: {
    generate: (projectPath: string, lineId: string, text: string, characterId: string) => Promise<{ ok: boolean; path?: string; error?: string }>
    preview: (text: string, provider: string, voiceId: string) => Promise<{ ok: boolean; url?: string; error?: string }>
    list: (projectPath: string) => Promise<{ ok: boolean; items: { id: string; text: string; audioPath?: string; characterId: string }[] }>
    delete: (projectPath: string, lineId: string) => Promise<{ ok: boolean; error?: string }>
  }
  store: {
    get: <T = unknown>(key: string) => Promise<T | undefined>
    set: <T = unknown>(key: string, value: T) => Promise<{ ok: boolean }>
  }
  dialog: {
    chooseDirectory: (opts?: { title?: string; defaultPath?: string }) => Promise<{ ok: boolean; path?: string; canceled?: boolean }>
  }
  asset: {
    resolve: (args: { projectPath: string; relPath: string }) => Promise<AssetResolveResult>
  }
  workspace: {
    readProject: (projectPath: string) => Promise<{ ok: boolean; layout: unknown }>
    writeProject: (projectPath: string, layout: unknown) => Promise<{ ok: boolean }>
    readGlobal: () => Promise<{ ok: boolean; layout: unknown }>
    writeGlobal: (layout: unknown) => Promise<{ ok: boolean }>
    /** PR2/PR3-A: 浮出 panel 到独立 BrowserWindow(5 个 panel) */
    openPanel: (args: {
      panelId:
        | 'script-editor'
        | 'flow-view'
        | 'preview-canvas'
        | 'left-tool-window'
        | 'ai-tool-window'
    }) => Promise<
      { ok: true; windowId: number } | { ok: false; error: string; code?: string }
    >
    /** PR2/PR3-A: 浮出窗口关闭时回调(用于清理 store) */
    onPanelClosed: (
      callback: (payload: {
        panelId:
          | 'script-editor'
          | 'flow-view'
          | 'preview-canvas'
          | 'left-tool-window'
          | 'ai-tool-window'
      }) => void
    ) => () => void
    /** PR2: mosaic 树持久化 */
    readMosaic: () => Promise<{ ok: boolean; tree: unknown; error?: string }>
    writeMosaic: (args: { tree: unknown }) => Promise<{ ok: boolean; error?: string; code?: string }>
    /** PR3-B: 浮出窗口请求聚焦主窗口 */
    focusMain: () => Promise<{ ok: boolean }>
  }
}

declare global {
  interface Window {
    galide: GalideApi
  }
}
