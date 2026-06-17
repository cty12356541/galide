/**
 * Asset IPC handler(规约: layers/main-process/conventions.yaml 资源管理)
 *
 * 当前实装范围(2026-06-15):
 *  - 仅注册 IPC.asset.list(channel 'asset:list')
 *  - 其余 5 个 read/create/update/delete/scan 在 adbf13e 的设计中提及,但 ipc-channels.ts
 *    没有对应常量,本轮不补通道(避免 ipc-channels.ts 改动扩散)。
 *  - 老规范里的 design intent 在后续 PR 通过 ipc-channels 扩展 + handler 实现补齐。
 *
 * 行为:
 *  - 列出项目根 assets/{kind} 下的文件(.png/.jpg/.jpeg/.webp 角色与背景,
 *    .mp3/.ogg/.wav BGM),返回相对路径 + 字节数。
 *  - 错误不 throw,统一返回 { ok: false, error } 形态(预 load + render 端依赖此约定)。
 *  - 类型严格遵守 preload 端 window.galide.asset.list 的返回签名。
 */

import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'

type AssetKind = 'characters' | 'backgrounds' | 'bgm'

type AssetEntry = {
  relPath: string
  kind: AssetKind
  size: number
}

type AssetListResult =
  | { ok: true; entries: AssetEntry[] }
  | { ok: false; error: string; entries: AssetEntry[] }

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.wav', '.m4a'])

const extOf = (filename: string): string => {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot).toLowerCase() : ''
}

const listDirectory = async (
  projectPath: string,
  kind: AssetKind
): Promise<AssetEntry[]> => {
  const dir = join(projectPath, 'assets', kind)
  let names: string[]
  try {
    names = await fs.readdir(dir)
  } catch {
    // 目录不存在 = 项目还没有该类资产,返回空列表(非错误)
    return []
  }
  const allowed = kind === 'bgm' ? AUDIO_EXTS : IMAGE_EXTS
  const entries: AssetEntry[] = []
  for (const name of names) {
    if (!allowed.has(extOf(name))) continue
    const full = join(dir, name)
    try {
      const stat = await fs.stat(full)
      if (!stat.isFile()) continue
      entries.push({
        relPath: `assets/${kind}/${name}`,
        kind,
        size: stat.size
      })
    } catch {
      // 单文件 stat 失败:跳过(权限 / 链接损坏)
      continue
    }
  }
  return entries
}

/**
 * 注册 asset 命名空间下的 IPC handler。
 *
 * 签名(无参)与项目内其他 handler(git-handlers / character-handlers / 等)保持一致:
 *  - electron 的 ipcMain 模块作用域常量直接 import,handler 不接受注入。
 *  - main/index.ts 走 `tryRegister('asset', registerAssetHandlers)` 无参调用。
 *  - 后续若引入 DI,改造路径见 git-handlers 的对应对照(无需本 PR 处理)。
 */
export const registerAssetHandlers = (): void => {
  ipcMain.handle(
    IPC.asset.list,
    async (
      _e,
      projectPath: string,
      kind: AssetKind
    ): Promise<AssetListResult> => {
      try {
        if (!projectPath || typeof projectPath !== 'string') {
          return { ok: false, error: 'projectPath 必须是非空字符串', entries: [] }
        }
        if (kind !== 'characters' && kind !== 'backgrounds' && kind !== 'bgm') {
          return { ok: false, error: `未知资产类别: ${kind}`, entries: [] }
        }
        const entries = await listDirectory(projectPath, kind)
        return { ok: true, entries }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { ok: false, error: message, entries: [] }
      }
    }
  )

  ipcMain.handle(
    IPC.asset.resolve,
    async (_e, projectPath: string, relPath: string) => {
      return resolveAsset(projectPath, relPath)
    }
  )
}
const _ALLOWED_PREFIXES = ['assets/', 'scripts/', '.galproj'] as const
const _MAX_DATAURL_SIZE = 5 * 1024 * 1024

const _safeResolve = (
  projectPath: string,
  relPath: string
): { ok: true; abs: string } | { ok: false; code: 'INVALID_PATH' | 'OUTSIDE_PROJECT'; error: string; isDataUrl?: never } => {
  if (!relPath || typeof relPath !== 'string') {
    return { ok: false, code: 'INVALID_PATH', error: 'relPath 不能为空' }
  }
  if (relPath.startsWith('/') || /^[a-zA-Z]:/.test(relPath)) {
    return { ok: false, code: 'INVALID_PATH', error: '绝对路径不被允许' }
  }
  if (relPath.split('/').includes('..')) {
    return { ok: false, code: 'OUTSIDE_PROJECT', error: '路径穿越不被允许' }
  }
  if (!_ALLOWED_PREFIXES.some((p) => relPath === p.slice(0, -1) || relPath.startsWith(p))) {
    return { ok: false, code: 'OUTSIDE_PROJECT', error: `path 必须以 ${_ALLOWED_PREFIXES.join(', ')} 开头` }
  }
  return { ok: true, abs: join(projectPath, relPath) }
}

const _guessMime = (p: string): string => {
  const ext = p.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    json: 'application/json',
    txt: 'text/plain'
  }
  return map[ext] ?? 'application/octet-stream'
}

export type ResolveAssetResult =
  | { ok: true; dataUrl: string; absolutePath: string; mime: string; size: number; isDataUrl: true }
  | { ok: true; dataUrl: null; absolutePath: string; mime: string; size: number; isDataUrl: false }
  | { ok: false; error: string; code: 'INVALID_PATH' | 'OUTSIDE_PROJECT' | 'NOT_FOUND' | 'TOO_LARGE' | 'READ_FAILED' }

export const resolveAsset = async (
  projectPath: string,
  relPath: string
): Promise<ResolveAssetResult> => {
  const r = _safeResolve(projectPath, relPath)
  if (!r.ok) {
    return r as ResolveAssetResult
  }
  let stat
  try {
    stat = await fs.stat(r.abs)
  } catch {
    return { ok: false, code: 'NOT_FOUND', error: `file not found: ${relPath}` }
  }
  if (!stat.isFile()) {
    return { ok: false, code: 'INVALID_PATH', error: 'not a file' }
  }
  const mime = _guessMime(r.abs)
  if (stat.size > _MAX_DATAURL_SIZE) {
    return { ok: true, dataUrl: null, absolutePath: r.abs, mime, size: stat.size, isDataUrl: false }
  }
  try {
    const buf = await fs.readFile(r.abs)
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
    return { ok: true, dataUrl, absolutePath: r.abs, mime, size: stat.size, isDataUrl: true }
  } catch (err) {
    return {
      ok: false,
      code: 'READ_FAILED',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
