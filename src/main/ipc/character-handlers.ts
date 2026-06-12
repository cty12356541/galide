import { ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc-channels.js'
import type { ProjectManifest } from '../../shared/types.js'

type CharacterInput = {
  id: string
  name: string
  description: string
  personality: string
  spriteSet: { state: string; path: string }[]
}

const readManifest = async (projectPath: string): Promise<ProjectManifest> => {
  const raw = await fs.readFile(join(projectPath, '.galproj'), 'utf-8')
  return JSON.parse(raw) as ProjectManifest
}

const writeManifest = async (projectPath: string, manifest: ProjectManifest): Promise<void> => {
  await fs.writeFile(join(projectPath, '.galproj'), JSON.stringify(manifest, null, 2))
}

export const registerCharacterHandlers = (): void => {
  ipcMain.handle(
    IPC.character.create,
    async (_e, projectPath: string, character: CharacterInput) => {
      try {
        const manifest = await readManifest(projectPath)
        manifest.characters = [...manifest.characters.filter((c) => c.id !== character.id), character]
        manifest.updatedAt = new Date().toISOString()
        await writeManifest(projectPath, manifest)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(
    IPC.character.update,
    async (_e, projectPath: string, character: CharacterInput) => {
      try {
        const manifest = await readManifest(projectPath)
        manifest.characters = manifest.characters.map((c) => (c.id === character.id ? character : c))
        manifest.updatedAt = new Date().toISOString()
        await writeManifest(projectPath, manifest)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle(IPC.character.list, async (_e, projectPath: string) => {
    try {
      const manifest = await readManifest(projectPath)
      return { ok: true, characters: manifest.characters }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IPC.character.delete, async (_e, projectPath: string, id: string) => {
    try {
      const manifest = await readManifest(projectPath)
      manifest.characters = manifest.characters.filter((c) => c.id !== id)
      manifest.updatedAt = new Date().toISOString()
      await writeManifest(projectPath, manifest)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
