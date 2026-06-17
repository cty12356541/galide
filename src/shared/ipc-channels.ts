/**
 * IPC 通道命名: module:action (camelCase)
 * 双向约定,renderer 端 lib/ipc/ 封装,main 端 ipc/ 监听
 */

export const IPC = {
  project: {
    open: 'project:open',
    openPath: 'project:openPath',
    save: 'project:save',
    create: 'project:create',
    close: 'project:close',
    recent: 'project:recent',
    listRecent: 'project:listRecent'
  },
  script: {
    parse: 'script:parse',
    read: 'script:read',
    write: 'script:write',
    list: 'script:list'
  },
  git: {
    init: 'git:init',
    status: 'git:status',
    commit: 'git:commit',
    log: 'git:log',
    diff: 'git:diff'
  },
  export: {
    start: 'export:start',
    progress: 'export:progress',
    cancel: 'export:cancel'
  },
  ai: {
    generate: 'ai:generate',
    stream: 'ai:stream',
    status: 'ai:status',
    cancel: 'ai:cancel',
    listTasks: 'ai:listTasks',
    listProviders: 'ai:listProviders',
    getConfig: 'ai:getConfig',
    setConfig: 'ai:setConfig',
    keySet: 'ai:keySet',
    keyDelete: 'ai:keyDelete',
    keyHas: 'ai:keyHas',
    connectionTest: 'ai:connectionTest',
    connTest: {
      stream: 'ai:connTest:stream',
      status: 'ai:connTest:status'
    }
  },
  preferences: {
    get: 'preferences:get',
    set: 'preferences:set',
    reset: 'preferences:reset',
    sectionReset: 'preferences:sectionReset',
    cacheDir: 'preferences:cacheDir',
    clearCache: 'preferences:clearCache'
  },
  shortcuts: {
    get: 'shortcuts:get',
    set: 'shortcuts:set',
    reset: 'shortcuts:reset'
  },
  character: {
    create: 'character:create',
    update: 'character:update',
    list: 'character:list',
    delete: 'character:delete'
  },
  voice: {
    generate: 'voice:generate',
    preview: 'voice:preview',
    list: 'voice:list',
    delete: 'voice:delete'
  },
  store: {
    get: 'store:get',
    set: 'store:set'
  },
  dialog: {
    chooseDirectory: 'dialog:chooseDirectory',
    confirm: 'dialog:confirm',
    prompt: 'dialog:prompt'
  },
  asset: {
    list: 'asset:list',
    resolve: 'asset:resolve'
  },
  workspace: {
    readProject: 'workspace:readProject',
    writeProject: 'workspace:writeProject',
    readGlobal: 'workspace:readGlobal',
    writeGlobal: 'workspace:writeGlobal',
    /** PR2: 在独立 BrowserWindow 中浮出 panel(走 main 端 createWindow) */
    openPanel: 'workspace:openPanel',
    /** PR2: 浮出 panel 关闭时通知 renderer 清理 store */
    panelClosed: 'workspace:panelClosed',
    /** PR3-B: 浮出窗口请求聚焦主窗口 */
    focusMain: 'workspace:focusMain',
    /** PR2: mosaic 树形布局持久化(独立 store,namespace=galide-mosaic) */
    mosaic: {
      read: 'workspace:mosaic:read',
      write: 'workspace:mosaic:write'
    }
  }
} as const

export type IpcChannel =
  | (typeof IPC)['project'][keyof (typeof IPC)['project']]
  | (typeof IPC)['script'][keyof (typeof IPC)['script']]
  | (typeof IPC)['git'][keyof (typeof IPC)['git']]
  | (typeof IPC)['export'][keyof (typeof IPC)['export']]
  | (typeof IPC)['ai'][keyof (typeof IPC)['ai']]
  | (typeof IPC)['preferences'][keyof (typeof IPC)['preferences']]
  | (typeof IPC)['shortcuts'][keyof (typeof IPC)['shortcuts']]
  | (typeof IPC)['character'][keyof (typeof IPC)['character']]
  | (typeof IPC)['voice'][keyof (typeof IPC)['voice']]
  | (typeof IPC)['store'][keyof (typeof IPC)['store']]
  | (typeof IPC)['dialog'][keyof (typeof IPC)['dialog']]
  | (typeof IPC)['asset'][keyof (typeof IPC)['asset']]
  | (typeof IPC)['workspace'][keyof (typeof IPC)['workspace']]
