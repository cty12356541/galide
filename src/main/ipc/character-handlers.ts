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
  type CharacterGit,
  type CharacterInput
} from './character-service.js'

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
    async (_e, projectPath: string, character: CharacterInput) => {
      const r = await createCharacter(projectPath, character, {
        fs: fsAdapter,
        git: gitAdapter,
        gitPrefs: getPreference('git')
      })
      if (r.ok === true) return { ok: true }
      return { ok: false, error: r.error.message }
    }
  )

  ipcMain.handle(
    IPC.character.update,
    async (_e, projectPath: string, character: CharacterInput) => {
      const r = await updateCharacter(projectPath, character, {
        fs: fsAdapter,
        git: gitAdapter,
        gitPrefs: getPreference('git')
      })
      if (r.ok === true) return { ok: true }
      return { ok: false, error: r.error.message }
    }
  )

  ipcMain.handle(IPC.character.list, async (_e, projectPath: string) => {
    return listCharacters(projectPath, { fs: fsAdapter })
  })

  ipcMain.handle(IPC.character.delete, async (_e, projectPath: string, id: string) => {
    const r = await deleteCharacter(projectPath, id, {
      fs: fsAdapter,
      git: gitAdapter,
      gitPrefs: getPreference('git')
    })
    if (r.ok === true) return { ok: true }
    return { ok: false, error: r.error.message }
  })
}
