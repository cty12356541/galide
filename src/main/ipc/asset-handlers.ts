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
        // 防御性:即便 listDirectory 内部已吞掉目录不存在的错,这里仍兜底
        return { ok: false, error: message, entries: [] }
      }
    }
  )
}