/**
 * brain-handlers — project-brain.json 读取 IPC
 */
import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '../../shared/ipc-channels.js'
import { readBrain } from '../brain/brain-store.js'
import type { ProjectBrain } from '../../shared/brain/schema.js'
import { parseIpcArgs, ipcSchemaFailure, BrainListSchema } from './schemas/index.js'

export type BrainListResult = {
  ok: boolean
  brain?: ProjectBrain
  /** 文件存在但损坏(已回退为空 brain) */
  invalid?: boolean
  error?: string
}

export const registerBrainHandlers = (): void => {
  ipcMain.handle(IPC.brain.list, async (_e, raw: unknown): Promise<BrainListResult> => {
    try {
      const args = parseIpcArgs('brain:list', BrainListSchema, raw)
      const r = await readBrain(args.projectPath, {
        readFile: (p) => fs.readFile(p, 'utf-8')
      })
      return { ok: true, brain: r.brain, invalid: r.invalid }
    } catch (err) {
      return ipcSchemaFailure(err)
    }
  })
}
