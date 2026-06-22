/**
 * script-store slice — 剧本编辑态(从 useUiStore 渐进拆出)
 *
 * 通过 createScriptSlice 注入 useUiStore;后续可独立为 useScriptStore。
 */
import { parse } from '../../../shared/dsl/parser'
import { serialize } from '../../../shared/dsl/serializer'
import type { ParseError, ScriptNode } from '../../../shared/dsl/types'

export const MAX_SCRIPT_HISTORY = 50

export type FileCacheEntry = {
  source: string
  dirty: boolean
  past: string[]
  future: string[]
}

export type ScriptSliceState = {
  activeScriptFile: string | null
  scriptSource: string
  scriptAst: ScriptNode | null
  scriptDiagnostics: ParseError[]
  scriptDirty: boolean
  scriptEditorScrollTarget: { line: number; column: number } | null
  openFiles: string[]
  fileCache: Record<string, FileCacheEntry>
  scriptPast: string[]
  scriptFuture: string[]
  selectedSceneId: string | null
}

export type ScriptSliceActions = {
  setActiveScript: (fileName: string | null) => void
  setSelectedSceneId: (id: string | null) => void
  setScriptEditorScrollTarget: (target: { line: number; column: number } | null) => void
  loadScriptText: (text: string) => void
  editScriptSource: (next: string) => void
  editScriptAst: (mutator: (ast: ScriptNode) => void) => void
  markScriptSaved: () => void
  undo: () => void
  redo: () => void
  closeScriptFile: (fileName: string) => void
  registerScriptSaveFlush: (fn: (() => Promise<void>) | null) => void
  flushPendingScriptSave: () => Promise<void>
}

export const scriptSliceInitialState: ScriptSliceState = {
  activeScriptFile: 'chapter1.gal',
  scriptSource: '',
  scriptAst: null,
  scriptDiagnostics: [],
  scriptDirty: false,
  scriptEditorScrollTarget: null,
  openFiles: [],
  fileCache: {},
  scriptPast: [],
  scriptFuture: [],
  selectedSceneId: null
}

export const parseToDoc = (
  text: string
): { scriptSource: string; scriptAst: ScriptNode | null; scriptDiagnostics: ParseError[] } => {
  const result = parse(text)
  if (result.ok !== true) {
    return { scriptSource: text, scriptAst: null, scriptDiagnostics: result.error }
  }
  return { scriptSource: text, scriptAst: result.value, scriptDiagnostics: result.value.errors }
}

let scriptSaveFlushImpl: (() => Promise<void>) | null = null

type SetFn = (partial: Partial<ScriptSliceState & ScriptSliceActions> | ((s: ScriptSliceState & ScriptSliceActions) => Partial<ScriptSliceState & ScriptSliceActions>)) => void
type GetFn = () => ScriptSliceState & ScriptSliceActions

export const createScriptSlice = (
  set: SetFn,
  get: GetFn
): ScriptSliceState & ScriptSliceActions => ({
  ...scriptSliceInitialState,

  setActiveScript: (fileName) => {
    if (fileName === null) {
      set({
        activeScriptFile: null,
        openFiles: [],
        fileCache: {},
        scriptSource: '',
        scriptAst: null,
        scriptDiagnostics: [],
        scriptDirty: false,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
      return
    }
    const s = get()
    if (fileName === s.activeScriptFile) {
      if (!s.openFiles.includes(fileName)) set({ openFiles: [...s.openFiles, fileName] })
      return
    }
    const fileCache = { ...s.fileCache }
    if (s.activeScriptFile) {
      fileCache[s.activeScriptFile] = {
        source: s.scriptSource,
        dirty: s.scriptDirty,
        past: s.scriptPast,
        future: s.scriptFuture
      }
    }
    const openFiles = s.openFiles.includes(fileName) ? s.openFiles : [...s.openFiles, fileName]
    const cached = fileCache[fileName]
    if (cached) {
      set({
        activeScriptFile: fileName,
        openFiles,
        fileCache,
        ...parseToDoc(cached.source),
        scriptDirty: cached.dirty,
        scriptPast: cached.past,
        scriptFuture: cached.future,
        selectedSceneId: null
      })
    } else {
      set({
        activeScriptFile: fileName,
        openFiles,
        fileCache,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
    }
  },

  setSelectedSceneId: (id) => set({ selectedSceneId: id }),

  setScriptEditorScrollTarget: (target) => set({ scriptEditorScrollTarget: target }),

  loadScriptText: (text) =>
    set({ ...parseToDoc(text), scriptDirty: false, scriptPast: [], scriptFuture: [] }),

  editScriptSource: (next) => set({ ...parseToDoc(next), scriptDirty: true, scriptFuture: [] }),

  editScriptAst: (mutator) => {
    const ast = get().scriptAst
    if (!ast) return
    const prev = get().scriptSource
    const clone = structuredClone(ast) as ScriptNode
    mutator(clone)
    set({
      scriptAst: clone,
      scriptSource: serialize(clone),
      scriptDiagnostics: clone.errors,
      scriptDirty: true,
      scriptPast: [...get().scriptPast, prev].slice(-MAX_SCRIPT_HISTORY),
      scriptFuture: []
    })
  },

  markScriptSaved: () => set({ scriptDirty: false }),

  undo: () => {
    const s = get()
    if (s.scriptPast.length === 0) return
    const past = [...s.scriptPast]
    const prev = past.pop() as string
    set({
      ...parseToDoc(prev),
      scriptDirty: true,
      scriptPast: past,
      scriptFuture: [s.scriptSource, ...s.scriptFuture].slice(0, MAX_SCRIPT_HISTORY)
    })
  },

  redo: () => {
    const s = get()
    if (s.scriptFuture.length === 0) return
    const future = [...s.scriptFuture]
    const next = future.shift() as string
    set({
      ...parseToDoc(next),
      scriptDirty: true,
      scriptPast: [...s.scriptPast, s.scriptSource].slice(-MAX_SCRIPT_HISTORY),
      scriptFuture: future
    })
  },

  closeScriptFile: (fileName) => {
    const s = get()
    const openFiles = s.openFiles.filter((f) => f !== fileName)
    const fileCache = { ...s.fileCache }
    delete fileCache[fileName]
    if (s.activeScriptFile !== fileName) {
      set({ openFiles, fileCache })
      return
    }
    const idx = s.openFiles.indexOf(fileName)
    const neighbor = openFiles[idx] ?? openFiles[idx - 1] ?? null
    if (neighbor === null) {
      set({
        openFiles: [],
        fileCache: {},
        activeScriptFile: null,
        scriptSource: '',
        scriptAst: null,
        scriptDiagnostics: [],
        scriptDirty: false,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
      return
    }
    const cached = fileCache[neighbor]
    if (cached) {
      set({
        activeScriptFile: neighbor,
        openFiles,
        fileCache,
        ...parseToDoc(cached.source),
        scriptDirty: cached.dirty,
        scriptPast: cached.past,
        scriptFuture: cached.future,
        selectedSceneId: null
      })
    } else {
      set({
        activeScriptFile: neighbor,
        openFiles,
        fileCache,
        scriptPast: [],
        scriptFuture: [],
        selectedSceneId: null
      })
    }
  },

  registerScriptSaveFlush: (fn) => {
    scriptSaveFlushImpl = fn
  },

  flushPendingScriptSave: async () => {
    if (scriptSaveFlushImpl) await scriptSaveFlushImpl()
  }
})
