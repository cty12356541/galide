/**
 * Electron Desktop shell 模板 — T3-4 MVP
 *
 * 依据 .omo/spike/desktop-shell/VERDICT.md 的 GO 结论:
 * - 自定义特权 scheme galgame:// + protocol.handle 映射到导出目录
 * - net.fetch(pathToFileURL) 读文件;必须 catch → 404(否则 renderer 见 ERR_UNEXPECTED)
 * - 路径穿越防护:normalize 后必须仍在导出目录内
 * - nodeIntegration:false / contextIsolation:true,无需 preload
 * - session.fromPartition('persist:galgame') 隔离存档 localStorage
 */

/** 壳工程 package.json 锁定的 electron 大版本(与 IDE devDependency 同 major) */
export const SHELL_ELECTRON_VERSION = '^35.7.5' as const

/** 项目显示名 → npm package name(小写 ASCII,非法字符折成 '-') */
export const toNpmPackageName = (displayName: string): string => {
  const cleaned = displayName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  return cleaned || 'galide-game'
}

/**
 * shell/main.cjs — CommonJS(Electron 主进程直接 require,不经过打包器)。
 * EXPORT_DIR 指向壳的上一级目录:composer 把 Web 导出产物(index.html + assets/)
 * 写在输出根,shell/ 是其子目录。
 */
export const buildShellMainCjs = (): string => `/**
 * Galide 桌面壳 — 由 Galide IDE「Electron Desktop」导出生成
 *
 * 机制(可行性验证见 IDE 仓库 .omo/spike/desktop-shell/VERDICT.md):
 *   galgame://app/<path> → <导出根目录>/<path>,经 protocol.handle + net.fetch。
 *   存档用 localStorage,按 galgame://app origin 持久化(persist:galgame 分区)。
 *
 * 未来 BGM 提示:Web 导出当前不含音频。若后续加入 <audio>,
 * Chromium 自动播放策略会拦截,请在下方 webPreferences 加:
 *   autoplayPolicy: 'no-user-gesture-required'
 *
 * CSP 提示:导出 HTML 目前是内联 <script>,如需 CSP 请用 hash 或抽出脚本,
 * 避免 'unsafe-inline'。
 */
const { app, BrowserWindow, protocol, net, session } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const EXPORT_DIR = path.resolve(__dirname, '..')
const ENTRY_URL = 'galgame://app/index.html'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'galgame',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      session: session.fromPartition('persist:galgame')
    }
  })
  win.loadURL(ENTRY_URL)
}

app.whenReady().then(() => {
  protocol.handle('galgame', async (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const filePath = path.normalize(path.join(EXPORT_DIR, pathname))
    if (filePath !== EXPORT_DIR && !filePath.startsWith(EXPORT_DIR + path.sep)) {
      return new Response('forbidden', { status: 403 })
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('not found: ' + pathname, { status: 404 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
`

export const buildShellPackageJson = (packageName: string): string =>
  JSON.stringify(
    {
      name: packageName,
      version: '0.1.0',
      private: true,
      description: 'Galide 桌面壳(由 Galide IDE 导出)',
      main: 'main.cjs',
      scripts: {
        start: 'electron .'
      },
      devDependencies: {
        electron: SHELL_ELECTRON_VERSION
      }
    },
    null,
    2
  ) + '\n'

export const buildShellReadme = (projectName: string): string => `# ${projectName} — 桌面壳工程

本目录由 Galide IDE「Electron Desktop」导出生成,是一个**可运行的 Electron 壳工程**:

- 上级目录的 \`index.html\` + \`assets/\` 是游戏本体(Web 导出产物)
- \`shell/main.cjs\` 通过自定义协议 \`galgame://\` 加载游戏,存档走 localStorage

## 运行(开发模式)

\`\`\`bash
cd shell
pnpm install   # 或 npm install(首次,安装 electron)
pnpm start     # 或 npm start
\`\`\`

## 下一步:打包分发

当前导出**只是壳工程**,尚未生成可分发的安装包。下一步用 electron-builder
(或 electron-forge)把壳 + 游戏产物一起打包:

\`\`\`bash
cd shell
pnpm add -D electron-builder
# 配置 electron-builder.yml 后:
pnpm electron-builder --mac   # 或 --win
\`\`\`

打包配置、签名、自动更新均不在本次导出范围内,请按需自行配置。
`
