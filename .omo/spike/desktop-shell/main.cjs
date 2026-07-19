/**
 * T3-3 spike — minimal Electron shell for the Web export.
 * Serves .omo/spike/export/ via custom privileged scheme galgame://app/...
 * Asserts: (a) no did-fail-load, (b) first dialogue text in DOM,
 * (c) zero failed asset requests + fetch() probe, (d) screenshot.
 * Writes results to results.json next to this file.
 */
const { app, BrowserWindow, protocol, net, session } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const EXPORT_DIR = path.resolve(__dirname, '..', 'export')
const RESULTS_PATH = path.join(__dirname, 'results.json')
const SCREENSHOT_PATH = path.resolve(__dirname, '..', 'screenshot.png')
const ENTRY_URL = 'galgame://app/index.html'

const results = {
  didFailLoad: [],
  failedRequests: [],
  consoleErrors: [],
  dialogueText: null,
  bodyHasMarker: null,
  fetchProbe: null,
  localStorageProbe: null,
  screenshotSaved: false,
  finished: false
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'galgame',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const finish = (code) => {
  results.finished = true
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2))
  console.log('[spike] results:', JSON.stringify(results, null, 2))
  app.exit(code)
}

app.whenReady().then(async () => {
  protocol.handle('galgame', async (request) => {
    const url = new URL(request.url)
    let pathname = decodeURIComponent(url.pathname)
    if (pathname === '/' || pathname === '') pathname = '/index.html'
    const filePath = path.join(EXPORT_DIR, pathname)
    if (!filePath.startsWith(EXPORT_DIR)) {
      return new Response('forbidden', { status: 403 })
    }
    try {
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch {
      return new Response('not found: ' + pathname, { status: 404 })
    }
  })

  const ses = session.defaultSession
  ses.webRequest.onErrorOccurred((details) => {
    results.failedRequests.push({ url: details.url, error: details.error })
  })

  const win = new BrowserWindow({
    width: 1320,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    results.didFailLoad.push({ errorCode, errorDescription, validatedURL })
  })
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) results.consoleErrors.push(message) // 2=warning,3=error
  })

  // Hard timeout: if we never reach assertions, record NO-GO evidence.
  const timeout = setTimeout(() => {
    results.consoleErrors.push('SPIKE TIMEOUT: did-finish-load assertions never ran')
    finish(2)
  }, 30000)

  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      clearTimeout(timeout)
      try {
        const probe = await win.webContents.executeJavaScript(`(async () => {
          const dialogue = document.querySelector('.dialogue .text')
          const character = document.querySelector('.dialogue .character')
          let fetchOk = null, fetchStatus = null
          try {
            const r = await fetch('assets/sprites/yuki_smile.png')
            fetchStatus = r.status
            fetchOk = r.ok && (await r.blob()).size > 0
          } catch (e) { fetchOk = 'ERR:' + (e && e.message ? e.message : String(e)) }
          let lsOk = null
          try {
            localStorage.setItem('galide-spike-probe', '1')
            lsOk = localStorage.getItem('galide-spike-probe') === '1'
          } catch (e) { lsOk = 'ERR:' + (e && e.message ? e.message : String(e)) }
          const bg = document.getElementById('bg')
          return {
            dialogueText: dialogue ? dialogue.textContent : null,
            character: character ? character.textContent : null,
            bodyHasMarker: document.body.innerText.includes('SPIKE_OK'),
            fetchOk, fetchStatus, lsOk,
            bgImage: bg ? bg.style.backgroundImage : null,
            spriteCount: document.querySelectorAll('#sprites img').length
          }
        })()`)
        results.dialogueText = probe.dialogueText
        results.character = probe.character
        results.bodyHasMarker = probe.bodyHasMarker
        results.fetchProbe = { ok: probe.fetchOk, status: probe.fetchStatus }
        results.localStorageProbe = probe.lsOk
        results.bgImage = probe.bgImage
        results.spriteCount = probe.spriteCount
      } catch (e) {
        results.consoleErrors.push('executeJavaScript failed: ' + (e && e.message ? e.message : String(e)))
      }

      try {
        const img = await win.webContents.capturePage()
        fs.writeFileSync(SCREENSHOT_PATH, img.toPNG())
        results.screenshotSaved = true
      } catch (e) {
        results.consoleErrors.push('capturePage failed: ' + (e && e.message ? e.message : String(e)))
      }

      const pass =
        results.didFailLoad.length === 0 &&
        results.bodyHasMarker === true &&
        results.failedRequests.length === 0 &&
        results.fetchProbe && results.fetchProbe.ok === true
      finish(pass ? 0 : 1)
    }, 1500)
  })

  win.loadURL(ENTRY_URL)
})
