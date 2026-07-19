/**
 * Electron Desktop shell 冒烟测试 — T3-4 MVP
 *
 * 默认只跑静态断言(壳模板关键机制),不启动 Electron。
 * 设置 GALIDE_E2E_ELECTRON=1 后启用真实 Electron 冒烟:
 *   fixture 项目 → runExportJob 导出 → 注入 smoke-main.cjs(改编自
 *   .omo/spike/desktop-shell/main.cjs 的断言)→ spawn electron →
 *   读 results.json 断言 didFailLoad/failedRequests 为空、首句对白在 DOM。
 *
 * 编排器单独跑 live 冒烟;CI/本地默认 skip。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { promises as fsp } from 'node:fs'
import { buildShellMainCjs } from './electron-desktop-shell-template.js'
import { runExportJob } from './run-export-job.js'

const execFileAsync = promisify(execFile)
const LIVE = process.env['GALIDE_E2E_ELECTRON'] === '1'

const tmpRoot = mkdtempSync(join(tmpdir(), 'galide-desktop-e2e-'))

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('electron-desktop shell 模板(静态断言)', () => {
  it('注册 galgame 特权 scheme(standard/secure/supportFetchAPI/stream)', () => {
    const main = buildShellMainCjs()
    expect(main).toContain('registerSchemesAsPrivileged')
    expect(main).toContain("scheme: 'galgame'")
    expect(main).toContain('standard: true')
    expect(main).toContain('secure: true')
    expect(main).toContain('supportFetchAPI: true')
    expect(main).toContain('stream: true')
  })

  it('protocol.handle 映射导出目录,net.fetch 失败必须 catch → 404', () => {
    const main = buildShellMainCjs()
    expect(main).toContain("protocol.handle('galgame'")
    expect(main).toContain('net.fetch(pathToFileURL(filePath).toString())')
    expect(main).toContain('catch')
    expect(main).toContain("new Response('not found: ' + pathname, { status: 404 })")
  })

  it('路径穿越防护: normalize 后必须仍在 EXPORT_DIR 内', () => {
    const main = buildShellMainCjs()
    expect(main).toContain('path.normalize')
    expect(main).toContain('filePath !== EXPORT_DIR && !filePath.startsWith(EXPORT_DIR + path.sep)')
    expect(main).toContain("new Response('forbidden', { status: 403 })")
  })

  it('窗口 1280x720 + 安全 webPreferences(nodeIntegration:false, contextIsolation:true)', () => {
    const main = buildShellMainCjs()
    expect(main).toContain('width: 1280')
    expect(main).toContain('height: 720')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain("ENTRY_URL = 'galgame://app/index.html'")
    expect(main).toContain('loadURL(ENTRY_URL)')
  })

  it('不含 spike 专属断言机器(results.json/capturePage 只在 smoke 注入脚本里)', () => {
    const main = buildShellMainCjs()
    expect(main).not.toContain('results.json')
    expect(main).not.toContain('capturePage')
  })
})

/** smoke 注入脚本: 复用导出壳的机制,追加断言与 results.json 输出 */
const buildSmokeMainCjs = (exportDir: string, resultsPath: string): string => `const { app, BrowserWindow, protocol, net, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const EXPORT_DIR = ${JSON.stringify(exportDir)}
const RESULTS_PATH = ${JSON.stringify(resultsPath)}

const results = { didFailLoad: [], failedRequests: [], dialogueText: null, localStorageProbe: null, finished: false }

protocol.registerSchemesAsPrivileged([
  { scheme: 'galgame', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

const finish = (code) => {
  results.finished = true
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
  app.exit(code)
}

app.whenReady().then(async () => {
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

  session.defaultSession.webRequest.onErrorOccurred((d) => {
    results.failedRequests.push({ url: d.url, error: d.error })
  })

  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    results.didFailLoad.push({ code, desc, url })
  })

  const timeout = setTimeout(() => finish(2), 30000)

  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      clearTimeout(timeout)
      try {
        const probe = await win.webContents.executeJavaScript(\`(async () => {
          const d = document.querySelector('.dialogue .text')
          let lsOk = null
          try {
            localStorage.setItem('galide-smoke', '1')
            lsOk = localStorage.getItem('galide-smoke') === '1'
          } catch (e) { lsOk = 'ERR' }
          return { text: d ? d.textContent : null, lsOk }
        })()\`)
        results.dialogueText = probe.text
        results.localStorageProbe = probe.lsOk
      } catch (e) {
        results.didFailLoad.push({ code: -999, desc: String(e), url: 'executeJavaScript' })
      }
      const pass =
        results.didFailLoad.length === 0 &&
        results.failedRequests.length === 0 &&
        typeof results.dialogueText === 'string' &&
        results.dialogueText.length > 0 &&
        results.localStorageProbe === true
      finish(pass ? 0 : 1)
    }, 1500)
  })

  win.loadURL('galgame://app/index.html')
})
`

describe.skipIf(!LIVE)('electron-desktop live 冒烟(GALIDE_E2E_ELECTRON=1)', () => {
  it('fixture 项目导出后,真实 Electron 壳加载首句对白且无失败请求', async () => {
    const projectPath = join(tmpRoot, 'project')
    const outputDir = join(tmpRoot, 'out')
    mkdirSync(join(projectPath, 'scripts'), { recursive: true })
    writeFileSync(
      join(projectPath, 'scripts', 'main.gal'),
      ['## s1', '小雪: "桌面壳冒烟 OK。"', ''].join('\n'),
      'utf-8'
    )

    const result = await runExportJob(
      { projectPath, target: 'electron-desktop', outputPath: outputDir },
      {
        fs: {
          readdir: (p) => fsp.readdir(p),
          readFile: (p) => fsp.readFile(p, 'utf-8'),
          mkdir: (p, o) => fsp.mkdir(p, o).then(() => undefined)
        }
      }
    )
    expect(result.ok).toBe(true)
    expect(existsSync(join(outputDir, 'shell', 'main.cjs'))).toBe(true)

    const resultsPath = join(tmpRoot, 'smoke-results.json')
    const smokePath = join(tmpRoot, 'smoke-main.cjs')
    writeFileSync(smokePath, buildSmokeMainCjs(outputDir, resultsPath), 'utf-8')

    const req = createRequire(import.meta.url)
    const electronBin = req('electron') as string
    // 壳以 app.exit(code) 结束: 0=pass, 1=断言失败, 2=超时;退出码本身不是错误,
    // 一律读 results.json 断言。
    try {
      await execFileAsync(electronBin, [smokePath], { timeout: 60000 })
    } catch {
      // 非零退出码会 reject,忽略,以 results.json 为准
    }

    expect(existsSync(resultsPath)).toBe(true)
    const smoke = JSON.parse(readFileSync(resultsPath, 'utf-8')) as {
      didFailLoad: unknown[]
      failedRequests: unknown[]
      dialogueText: string | null
      localStorageProbe: boolean | null
      finished: boolean
    }
    expect(smoke.finished).toBe(true)
    expect(smoke.didFailLoad).toEqual([])
    expect(smoke.failedRequests).toEqual([])
    expect(smoke.dialogueText).toContain('桌面壳冒烟 OK')
    expect(smoke.localStorageProbe).toBe(true)
  }, 90000)
})
