import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '../../shared/ipc-channels.js'
import { parseIpcArgs, PreviewSaveSlotSchema, PreviewLoadSlotSchema } from './schemas/index.js'
import {
  loadPreviewSlot,
  savePreviewSlot,
  listPreviewSlots,
  type PreviewFs
} from './preview-service.js'
import type { VmState } from '../../shared/preview/runtime-vm.js'

const fsAdapter: PreviewFs = {
  readFile: (path) => fs.readFile(path, 'utf-8'),
  writeFile: (path, content) => fs.writeFile(path, content, 'utf-8'),
  mkdir: (path, opts) => fs.mkdir(path, opts),
  readdir: (path) => fs.readdir(path)
}

export const registerPreviewHandlers = (): void => {
  ipcMain.handle(
    IPC.preview.saveSlot,
    async (
      _e,
      raw: unknown
    ): Promise<{ ok: true; timestamp: string } | { ok: false; error: string; code?: string }> => {
      const args = parseIpcArgs('preview:saveSlot', PreviewSaveSlotSchema, raw)
      const r = await savePreviewSlot(args.projectPath, args.slot, args.state as VmState, fsAdapter)
      if (r.ok === false) return { ok: false, error: r.error.message, code: r.error.code }
      return { ok: true, timestamp: r.timestamp }
    }
  )

  ipcMain.handle(
    IPC.preview.loadSlot,
    async (
      _e,
      raw: unknown
    ): Promise<
      | { ok: true; state: VmState; timestamp: string }
      | { ok: false; error: string; code?: string }
    > => {
      const args = parseIpcArgs('preview:loadSlot', PreviewLoadSlotSchema, raw)
      const r = await loadPreviewSlot(args.projectPath, args.slot, fsAdapter)
      if (r.ok === false) return { ok: false, error: r.error.message, code: r.error.code }
      return { ok: true, state: r.state, timestamp: r.timestamp }
    }
  )

  ipcMain.handle(
    IPC.preview.listSlots,
    async (
      _e,
      projectPath: string
    ): Promise<{ ok: true; slots: Awaited<ReturnType<typeof listPreviewSlots>> } | { ok: false; error: string }> => {
      try {
        const slots = await listPreviewSlots(projectPath, fsAdapter)
        return { ok: true, slots }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }
  )
}
