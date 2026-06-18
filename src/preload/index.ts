import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels.js'
import type { ProjectManifest, ProjectOpenResult } from '../shared/types'
import type { Result, ScriptNode, ParseError } from '../shared/dsl/types'

type GitStatus = {
  initialized: boolean
  current: string | null
  files: { path: string; index: string; working_dir: string }[]
}

type GitCommit = {
  hash: string
  date: string
  message: string
  author: string
}

type CharacterInput = {
  id: string
  name: string
  description: string
  personality: string
  spriteSet: { state: string; path: string }[]
}

type CharacterListResult = {
  ok: boolean
  characters?: CharacterInput[]
  error?: string
}

type AiConfig = {
  provider: 'openai' | 'claude' | 'ollama'
  baseUrl?: string
  model?: string
}

type AiProviderInfo = {
  id: 'openai' | 'claude' | 'ollama'
  name: string
  models: string[]
}

const api = {
  project: {
    create: (name: string): Promise<ProjectOpenResult> =>
      ipcRenderer.invoke(IPC.project.create, name),
    open: (): Promise<ProjectOpenResult> => ipcRenderer.invoke(IPC.project.open),
    openPath: (projectPath: string): Promise<ProjectOpenResult> =>
      ipcRenderer.invoke(IPC.project.openPath, projectPath),
    save: (projectPath: string, manifest: ProjectManifest): Promise<ProjectOpenResult> =>
      ipcRenderer.invoke(IPC.project.save, projectPath, manifest),
    close: (): Promise<{ ok: true }> => ipcRenderer.invoke(IPC.project.close),
    recordRecent: (entry: { path: string; name: string }): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.project.recent, entry),
    listRecent: (): Promise<{ ok: boolean; items: { path: string; name: string; lastOpened: string }[] }> =>
      ipcRenderer.invoke(IPC.project.listRecent)
  },
  script: {
    read: (projectPath: string, fileName: string): Promise<string> =>
      ipcRenderer.invoke(IPC.script.read, projectPath, fileName),
    write: (projectPath: string, fileName: string, content: string): Promise<{ ok: boolean; error?: string; code?: string }> =>
      ipcRenderer.invoke(IPC.script.write, projectPath, fileName, content),
    parse: (source: string): Promise<Result<ScriptNode, ParseError[]>> =>
      ipcRenderer.invoke(IPC.script.parse, source),
    list: (projectPath: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.script.list, projectPath)
  },
  git: {
    init: (projectPath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.git.init, projectPath),
    status: (projectPath: string): Promise<GitStatus> =>
      ipcRenderer.invoke(IPC.git.status, projectPath),
    commit: (projectPath: string, message: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.git.commit, projectPath, message),
    log: (projectPath: string): Promise<GitCommit[]> =>
      ipcRenderer.invoke(IPC.git.log, projectPath),
    diff: (projectPath: string, filePath: string): Promise<string> =>
      ipcRenderer.invoke(IPC.git.diff, projectPath, filePath)
  },
  export: {
    start: (req: { projectPath: string; target: string; outputPath: string }): Promise<{ ok: boolean; error?: string; code?: string; jobId?: string; paths?: readonly string[] }> =>
      ipcRenderer.invoke(IPC.export.start, req),
    cancel: (jobId: string): Promise<{ ok: boolean; cancelled: boolean }> =>
      ipcRenderer.invoke(IPC.export.cancel, jobId),
    onProgress: (callback: (progress: { stage: string; progress: number; message: string; jobId?: string }) => void): (() => void) => {
      const listener = (_e: unknown, progress: { stage: string; progress: number; message: string; jobId?: string }): void =>
        callback(progress)
      ipcRenderer.on(IPC.export.progress, listener)
      return () => ipcRenderer.removeListener(IPC.export.progress, listener)
    }
  },
  ai: {
    generate: (req: {
      prompt: string
      context: string
      provider: string
      model?: string
      baseUrl?: string
    }): Promise<{ taskId: string; status: 'pending' }> => ipcRenderer.invoke(IPC.ai.generate, req),
    cancel: (taskId: string): Promise<{ ok: boolean; cancelled: boolean }> =>
      ipcRenderer.invoke(IPC.ai.cancel, taskId),
    listTasks: (): Promise<{
      tasks: Array<{
        taskId: string
        status: 'pending' | 'running' | 'done' | 'error'
        prompt: string
        provider: 'openai' | 'claude' | 'ollama'
        error?: string
        createdAt: number
      }>
    }> => ipcRenderer.invoke(IPC.ai.listTasks),
    stream: (callback: (chunk: { taskId: string; delta: string }) => void): (() => void) => {
      const listener = (_e: unknown, chunk: { taskId: string; delta: string }): void => callback(chunk)
      ipcRenderer.on(IPC.ai.stream, listener)
      return () => ipcRenderer.removeListener(IPC.ai.stream, listener)
    },
    onStatus: (callback: (status: { taskId: string; status: string; error?: string }) => void): (() => void) => {
      const listener = (_e: unknown, status: { taskId: string; status: string; error?: string }): void =>
        callback(status)
      ipcRenderer.on(IPC.ai.status, listener)
      return () => ipcRenderer.removeListener(IPC.ai.status, listener)
    },
    listProviders: (): Promise<(AiProviderInfo & { hasKey: boolean })[]> =>
      ipcRenderer.invoke(IPC.ai.listProviders),
    getConfig: (): Promise<AiConfig> => ipcRenderer.invoke(IPC.ai.getConfig),
    setConfig: (config: AiConfig): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.ai.setConfig, config),
    keySet: (provider: 'openai' | 'claude' | 'ollama', key: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.ai.keySet, provider, key),
    keyDelete: (provider: 'openai' | 'claude' | 'ollama'): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.ai.keyDelete, provider),
    keyHas: (provider: 'openai' | 'claude' | 'ollama'): Promise<boolean> =>
      ipcRenderer.invoke(IPC.ai.keyHas, provider),
    connectionTest: (req: {
      prompt: string
      context: string
      provider: 'openai' | 'claude' | 'ollama'
      model?: string
      baseUrl?: string
    }): Promise<{ taskId: string; status: 'pending' } | { ok: false; error: string }> =>
      ipcRenderer.invoke(IPC.ai.connectionTest, req)
  },
  preferences: {
    get: <K extends string>(key: K): Promise<unknown> => ipcRenderer.invoke(IPC.preferences.get, key),
    set: <K extends string>(key: K, value: unknown): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.preferences.set, key, value),
    reset: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.preferences.reset),
    sectionReset: (section: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.preferences.sectionReset, section),
    getCacheDir: (): Promise<string> => ipcRenderer.invoke(IPC.preferences.cacheDir),
    clearCache: (): Promise<{ ok: boolean; removed: number; error?: string }> =>
      ipcRenderer.invoke(IPC.preferences.clearCache)
  },
  shortcuts: {
    get: (): Promise<Record<string, string>> => ipcRenderer.invoke(IPC.shortcuts.get),
    set: (shortcuts: Record<string, string>): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.shortcuts.set, shortcuts),
    reset: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.shortcuts.reset)
  },
  character: {
    create: (projectPath: string, character: CharacterInput): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.character.create, projectPath, character),
    update: (projectPath: string, character: CharacterInput): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.character.update, projectPath, character),
    list: (projectPath: string): Promise<CharacterListResult> =>
      ipcRenderer.invoke(IPC.character.list, projectPath),
    delete: (projectPath: string, id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.character.delete, projectPath, id)
  },
  voice: {
    generate: (projectPath: string, lineId: string, text: string, characterId: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.voice.generate, projectPath, lineId, text, characterId),
    preview: (text: string, provider: string, voiceId: string): Promise<{ ok: boolean; url?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.voice.preview, text, provider, voiceId),
    list: (projectPath: string): Promise<{ ok: boolean; items: { id: string; text: string; audioPath?: string; characterId: string }[] }> =>
      ipcRenderer.invoke(IPC.voice.list, projectPath),
    delete: (projectPath: string, lineId: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.voice.delete, projectPath, lineId)
  },
  store: {
    get: <T = unknown>(key: string): Promise<T | undefined> =>
      ipcRenderer.invoke(IPC.store.get, key),
    set: <T = unknown>(key: string, value: T): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.store.set, key, value)
  },
  dialog: {
    chooseDirectory: (opts?: { title?: string; defaultPath?: string }): Promise<{ ok: boolean; path?: string; canceled?: boolean }> =>
      ipcRenderer.invoke(IPC.dialog.chooseDirectory, opts ?? {}),
    confirm: (opts: {
      title?: string
      message: string
      detail?: string
      confirmLabel?: string
      cancelLabel?: string
      destructive?: boolean
    }): Promise<{ ok: boolean; confirmed: boolean }> =>
      ipcRenderer.invoke(IPC.dialog.confirm, opts),
    prompt: (opts: {
      title?: string
      label: string
      placeholder?: string
      defaultValue?: string
    }): Promise<{ ok: boolean; value: string; canceled: boolean }> =>
      ipcRenderer.invoke(IPC.dialog.prompt, opts)
  },
  asset: {
    list: (
      projectPath: string,
      kind: 'characters' | 'backgrounds' | 'bgm'
    ): Promise<{ ok: boolean; entries: { relPath: string; kind: 'characters' | 'backgrounds' | 'bgm'; size: number }[] }> =>
      ipcRenderer.invoke(IPC.asset.list, projectPath, kind),
    resolve: (
      args: { projectPath: string; relPath: string }
    ): Promise<{
      ok: boolean
      dataUrl?: string
      absolutePath?: string
      mime?: string
      size?: number
      isDataUrl?: boolean
      code?: string
      error?: string
    }> => ipcRenderer.invoke(IPC.asset.resolve, args.projectPath, args.relPath)
  },
workspace: {
    /** 浮出 panel 到独立 BrowserWindow(编辑器大陆/主岛/可脱离子岛) */
    openPanel: (
      args: {
        panelId:
          | 'script-editor'
          | 'flow-view'
          | 'preview-canvas'
          | 'project'
          | 'git'
          | 'outline'
          | 'character'
          | 'ai'
          | 'scripts'
          | 'assets'
          | 'profiles'
          | 'voice'
      }
    ): Promise<
      { ok: true; windowId: number } | { ok: false; error: string; code?: string }
    > => ipcRenderer.invoke(IPC.workspace.openPanel, args),
    /** 浮出窗口关闭时回调(用于清理 store + restore) */
    onPanelClosed: (
      callback: (
        payload: {
          panelId:
            | 'script-editor'
            | 'flow-view'
            | 'preview-canvas'
            | 'project'
            | 'git'
            | 'outline'
            | 'character'
            | 'ai'
            | 'scripts'
            | 'assets'
            | 'profiles'
            | 'voice'
        }
      ) => void
    ): (() => void) => {
      const listener = (
        _e: unknown,
        payload: {
          panelId:
            | 'script-editor'
            | 'flow-view'
            | 'preview-canvas'
            | 'project'
            | 'git'
            | 'outline'
            | 'character'
            | 'ai'
            | 'scripts'
            | 'assets'
            | 'profiles'
            | 'voice'
        }
      ): void => callback(payload)
      ipcRenderer.on(IPC.workspace.panelClosed, listener)
      return () => ipcRenderer.removeListener(IPC.workspace.panelClosed, listener)
    },
    /** 功能即岛 v2:从主窗口按 panelId 收回浮出窗口 */
    closePanel: (
      args: {
        panelId:
          | 'script-editor'
          | 'flow-view'
          | 'preview-canvas'
          | 'project'
          | 'git'
          | 'outline'
          | 'character'
          | 'ai'
          | 'scripts'
          | 'assets'
          | 'profiles'
          | 'voice'
      }
    ): Promise<{ ok: true } | { ok: false; error: string; code?: string }> =>
      ipcRenderer.invoke(IPC.workspace.closePanel, args),
    /** PR2: mosaic 树持久化 */
    readMosaic: (): Promise<{ ok: boolean; tree: unknown; error?: string }> =>
      ipcRenderer.invoke(IPC.workspace.mosaic.read),
    writeMosaic: (args: { tree: unknown }): Promise<{ ok: boolean; error?: string; code?: string }> =>
      ipcRenderer.invoke(IPC.workspace.mosaic.write, args),
    /** PR3-B: 浮出窗口请求聚焦主窗口 */
    focusMain: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.workspace.focusMain)
  }
}

contextBridge.exposeInMainWorld('galide', api)

export type GalideApi = typeof api
