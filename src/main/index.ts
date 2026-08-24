import { app, BrowserWindow, shell } from 'electron'
import { IPC } from '../shared/ipc-channels.js'
import { join } from 'node:path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { initKeyStore, type SafeStorageLike } from './ai/key-store.js'
import { warmUpStore } from './store/store.js'
import {registerProjectHandlers, openProjectAtPath } from './ipc/project-handlers.js'
import { registerScriptHandlers } from './ipc/script-handlers.js'
import { registerReplaceHandlers } from './ipc/replace-handlers.js'
import { registerGitHandlers } from './ipc/git-handlers.js'
import { registerExportHandlers } from './ipc/export-handlers.js'
import { registerAiHandlers } from './ipc/ai-handlers.js'
import { registerAgentHandlers } from './ipc/agent-handlers.js'
import { registerCharacterHandlers } from './ipc/character-handlers.js'
import { registerBrainHandlers } from './ipc/brain-handlers.js'
import { registerVoiceHandlers } from './ipc/voice-handlers.js'
import { registerImageHandlers } from './ipc/image-handlers.js'
import { registerAssetHandlers } from './ipc/asset-handlers.js'
import { registerStoreHandlers } from './ipc/store-handlers.js'
import { registerPreferencesHandlers } from './ipc/preferences-handlers.js'
import { registerDialogHandlers } from './ipc/dialog-handlers.js'
import { registerWorkspaceHandlers } from './ipc/workspace-handlers.js'
import { registerPreviewHandlers } from './ipc/preview-handlers.js'

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#fafaf9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // SECURITY(sandbox): disabled because preload/index.ts (~487 lines) uses ipcRenderer,
      // contextBridge.exposeInMainWorld, and Node.js APIs that are incompatible with Electron
      // sandbox mode. A sandbox:true migration would require restructuring all preload code.
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // T3/T6 P0-1 / F-02 修复(2026-06-14): setWindowOpenHandler URL 白名单
  // 仅 https: / http: 走 OS 默认 handler,其他 scheme(file://, smb://, javascript:, mailto: 等)被 deny。
  // 防止 XSS 后触发本地应用、钓鱼 URL。
  const ALLOWED_EXTERNAL_SCHEMES = new Set(['https:', 'http:'])
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url)
      if (ALLOWED_EXTERNAL_SCHEMES.has(u.protocol)) {
        shell.openExternal(url)
      }
    } catch {
      // 解析失败的 URL 一律 deny
    }
    return { action: 'deny' }
  })

  // CSP 仅在 production 注入;dev 阶段由 Vite 自管,避免 HMR/eval 被 block 导致白屏
  if (process.env.NODE_ENV === 'production') {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'"
          ]
        }
      })
    })
  }

  // dev 阶段用 Vite dev server URL;production 用本地打包文件
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // dev-only 视觉冒烟(GALIDE_VISUAL_SMOKE=1):开项→截屏→合成 Cmd+6 开 brain 面板→再截屏→退出。
  // 用于无辅助权限/无录屏权限环境下的真实 UI 验证;production 打包不受影响(env 不存在)。
  const smokeProject = process.env['GALIDE_OPEN_PROJECT']
  if (process.env['GALIDE_SMOKE_JS']) {
    void runJsSmoke(mainWindow, smokeProject, process.env['GALIDE_SMOKE_JS']!)
  } else if (process.env['GALIDE_VISUAL_SMOKE'] === '1') {
    void runVisualSmoke(mainWindow, smokeProject)
  } else if (smokeProject) {
    // 仅开项不截屏(供其他手动验证用)
    mainWindow.webContents.once('did-finish-load', () => {
      void openProjectInRenderer(mainWindow, smokeProject)
    })
  }
}

const openProjectInRenderer = async (
  win: BrowserWindow,
  projectPath: string
): Promise<void> => {
  const r = await openProjectAtPath(projectPath)
  if (r.ok === true) {
    win.webContents.send(IPC.project.opened, {
      projectPath: r.projectPath,
      manifest: r.manifest
    })
  } else {
    console.error(`[visual-smoke] open project failed: ${r.error}`)
  }
}

const runVisualSmoke = async (win: BrowserWindow, projectPath?: string): Promise<void> => {
  try {
    await new Promise<void>((resolve) => {
      win.webContents.once('did-finish-load', () => resolve())
      // did-finish-load 可能已触发过,超时兜底
      setTimeout(resolve, 10_000)
    })
    // 绕过本机窗口管理器的迷你吸附,给截屏一个可用视口
    win.setSize(1280, 860)
    win.center()
    if (projectPath) await openProjectInRenderer(win, projectPath)
    await new Promise((r) => setTimeout(r, 3_000))
    await captureToFile(win, '/tmp/galide-visual-1.png')

    // 合成 Cmd+6(showBrain) — use-keyboard-shortcuts 不校验 isTrusted
    await win.webContents.executeJavaScript(
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: '6', code: 'Digit6', metaKey: true, bubbles: true }))`,
      true
    )
    await new Promise((r) => setTimeout(r, 1_500))
    await captureToFile(win, '/tmp/galide-visual-2.png')
    console.log('[visual-smoke] captured /tmp/galide-visual-1.png /tmp/galide-visual-2.png')
  } catch (err) {
    console.error('[visual-smoke] failed:', err)
  } finally {
    app.quit()
  }
}

/** dev-only JS 冒烟:加载后执行 JS 文件,等待后 dump window.__smoke 并退出 */
const runJsSmoke = async (
  win: BrowserWindow,
  projectPath: string | undefined,
  jsPath: string
): Promise<void> => {
  console.log(`[js-smoke] starting (js=${jsPath})`)
  try {
    await new Promise<void>((resolve) => {
      win.webContents.once('did-finish-load', () => resolve())
      setTimeout(resolve, 10_000)
    })
    if (projectPath) await openProjectInRenderer(win, projectPath)
    await new Promise((r) => setTimeout(r, 1_500))
    const { readFile } = await import('node:fs/promises')
    const js = await readFile(jsPath, 'utf-8')
    await win.webContents.executeJavaScript(js, true)
    const waitMs = Number(process.env['GALIDE_SMOKE_WAIT'] ?? 25_000)
    const startedAt = Date.now()
    let dump: string | null = null
    while (Date.now() - startedAt < waitMs) {
      if (win.isDestroyed()) {
        console.error('[js-smoke] window destroyed during wait')
        break
      }
      await new Promise((r) => setTimeout(r, 4_000))
      if (win.isDestroyed()) {
        console.error('[js-smoke] window destroyed during wait')
        break
      }
      const last = await win.webContents.executeJavaScript(
        "(window.__smoke?.statuses?.at(-1)?.status) ?? (window.__smoke?.generateError ? 'error' : null)"
      )
      if (last === 'done' || last === 'error' || last === 'cancelled') {
        await new Promise((r) => setTimeout(r, 500))
        dump = await win.webContents.executeJavaScript(
          'window.__smoke ? JSON.stringify(window.__smoke, null, 2) : "null"'
        )
        break
      }
    }
    if (!dump && !win.isDestroyed()) {
      dump = await win.webContents.executeJavaScript(
        'window.__smoke ? JSON.stringify(window.__smoke, null, 2) : "null"'
      )
    }
    console.log(`[js-smoke] __smoke = ${dump ?? '(window gone)'}`)
  } catch (err) {
    console.error('[js-smoke] failed:', err)
  } finally {
    app.quit()
  }
}

const captureToFile = async (win: BrowserWindow, path: string): Promise<void> => {
  const image = await win.webContents.capturePage()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(path, image.toPNG())
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.galide.app')

  // P0-4: 优先初始化 KeyStore(派生 encryptionKey from OS keychain)。
  // dev 阶段若 keychain 不可访问,允许降级为明文存储,避免进程在开发环境因 keychain 弹窗
  // 取消而崩溃;production 仍要求 safeStorage 可用,防止静默退化到无加密状态。
  if (process.env.NODE_ENV === 'production') {
    initKeyStore()
  } else {
    const devPlainTextStorage: SafeStorageLike = {
      isEncryptionAvailable: () => true,
      encryptString: (plainText) => Buffer.from(plainText, 'utf-8'),
      decryptString: (buffer) => buffer.toString('utf-8')
    }
    initKeyStore({ safeStorage: devPlainTextStorage })
  }

  // P0-2: 启动期 warm up 通用 store,处理 hot-reload 偶发的 ELIFECYCLE 锁冲突
  await warmUpStore()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 防御性注册(2026-06-15 修复): 个别 handler 内部对 IPC 字段强引用
  // (IPC.asset.list / IPC.workspace.*),如 ipc-channels.ts 漏声明会导致
  // TypeError 抛出,阻断 whenReady 回调后续 createWindow。
  // 每个 handler 包 try/catch 隔离失败,任一 handler 失败不阻断主流程。
  const tryRegister = (name: string, fn: () => void): void => {
    try {
      fn()
    } catch (err) {
      console.error(`[galide] ${name} 注册失败:`, err)
    }
  }
  tryRegister('project', registerProjectHandlers)
  tryRegister('script', registerScriptHandlers)
  tryRegister('replace', registerReplaceHandlers)
  tryRegister('git', registerGitHandlers)
  tryRegister('export', registerExportHandlers)
  tryRegister('ai', registerAiHandlers)
  tryRegister('agent', registerAgentHandlers)
  tryRegister('character', registerCharacterHandlers)
  tryRegister('brain', registerBrainHandlers)
  tryRegister('voice', registerVoiceHandlers)
  tryRegister('image', registerImageHandlers)
  tryRegister('asset', registerAssetHandlers)
  tryRegister('store', registerStoreHandlers)
  tryRegister('preferences', registerPreferencesHandlers)
  tryRegister('dialog', registerDialogHandlers)
  tryRegister('workspace', registerWorkspaceHandlers)
  tryRegister('preview', registerPreviewHandlers)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
