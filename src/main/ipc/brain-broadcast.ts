/**
 * brain-broadcast — brain 文件写入后通知 renderer(main → renderer 事件)
 *
 * agent 工具的 ctx.fs.writeFile 经此包装:命中 project-brain.json 时
 * 广播 brain:changed,BrainPanel 据此自动刷新。与 script-broadcast 同构。
 */
import { basename, dirname, join } from 'node:path'
import type { WebContents } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'

export type BrainChangedNotifier = (projectPath: string) => void

export const BRAIN_FILE = 'project-brain.json'

export const createBrainBroadcastingWriteFile = (
  projectPath: string | (() => string),
  writeFile: (path: string, content: string) => Promise<void>,
  notify: BrainChangedNotifier
): ((path: string, content: string) => Promise<void>) => {
  const resolveProjectPath = (): string =>
    typeof projectPath === 'function' ? projectPath() : projectPath
  return async (filePath, content) => {
    await writeFile(filePath, content)
    // 只广播项目根的 brain 文件(排除嵌套目录同名文件)
    if (basename(filePath) !== BRAIN_FILE) return
    if (dirname(filePath) !== resolveProjectPath()) return
    notify(resolveProjectPath())
  }
}

export const createBrainNotifier = (sender: WebContents): BrainChangedNotifier => {
  return (projectPath) => {
    if (sender.isDestroyed()) return
    sender.send(IPC.brain.changed, { projectPath })
  }
}

export const brainPathOf = (projectPath: string): string => join(projectPath, BRAIN_FILE)
