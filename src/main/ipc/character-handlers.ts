import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { IPC } from '../../shared/ipc-channels.js'
import { gitService } from '../git/git-service.js'
import { getPreference } from '../preferences/preferences-store.js'
import {
  createCharacter,
  updateCharacter,
  deleteCharacter,
  listCharacters,
  type CharacterFs,
  type CharacterGit
} from './character-service.js'
import {
  parseIpcArgs,
  ipcSchemaFailure,
  CharacterCreateSchema,
  CharacterUpdateSchema,
  CharacterDeleteSchema,
  CharacterListSchema
} from './schemas/index.js'

/**
 * P2 修复:角色 CRUD 走 service,统一 git autoCommitOnSave。
 */
const fsAdapter: CharacterFs = {
  readFile: (path) => fs.readFile(path, 'utf-8'),
  writeFile: (path, content) => fs.writeFile(path, content, 'utf-8')
}

const gitAdapter: CharacterGit = {
  addAndCommit: (projectPath, files, message) => gitService.addAndCommit(projectPath, files, message)
}

export const registerCharacterHandlers = (): void => {
  ipcMain.handle(
    IPC.character.create,
    async (_e, raw: unknown) => {
      try {
        const args = parseIpcArgs('character:create', CharacterCreateSchema, raw)
        const r = await createCharacter(args.projectPath, args.character, {
          fs: fsAdapter,
          git: gitAdapter,
          gitPrefs: getPreference('git')
        })
        if (r.ok === true) return { ok: true }
        return { ok: false, error: r.error.message }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.character.update,
    async (_e, raw: unknown) => {
      try {
        const args = parseIpcArgs('character:update', CharacterUpdateSchema, raw)
        const r = await updateCharacter(args.projectPath, args.character, {
          fs: fsAdapter,
          git: gitAdapter,
          gitPrefs: getPreference('git')
        })
        if (r.ok === true) return { ok: true }
        return { ok: false, error: r.error.message }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.character.list,
    async (_e, raw: unknown) => {
      try {
        const args = parseIpcArgs('character:list', CharacterListSchema, raw)
        return listCharacters(args.projectPath, { fs: fsAdapter })
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )

  ipcMain.handle(
    IPC.character.delete,
    async (_e, raw: unknown) => {
      try {
        const args = parseIpcArgs('character:delete', CharacterDeleteSchema, raw)
        const r = await deleteCharacter(args.projectPath, args.id, {
          fs: fsAdapter,
          git: gitAdapter,
          gitPrefs: getPreference('git')
        })
        if (r.ok === true) return { ok: true }
        return { ok: false, error: r.error.message }
      } catch (err) {
        return ipcSchemaFailure(err)
      }
    }
  )
}
