/**
 * character-service 单测
 * 规约: layers/main-process/conventions.yaml — git autoCommitOnSave 应作用于 manifest 变更
 *       core/patterns.yaml:56-60 — Result<T, E>
 */
import { describe, it, expect } from 'vitest'
import {
  createCharacter,
  updateCharacter,
  deleteCharacter,
  listCharacters,
  type CharacterFs,
  type CharacterGit,
  type CharacterInput
} from './character-service.js'
import type { GitPreferences } from '../../shared/preferences.js'
import type { ProjectManifest } from '../../shared/types.js'

const baseGitPrefs: GitPreferences = {
  autoInit: false,
  autoCommitOnSave: false,
  defaultAuthorName: 'Tester',
  defaultAuthorEmail: 'tester@example.com',
  initialCommitMessage: 'initial'
}

const sampleCharacter: CharacterInput = {
  id: 'char-1',
  name: '小雪',
  description: '转学生',
  personality: '文静',
  spriteSet: [{ state: 'default', path: 'assets/characters/koyuki.png' }]
}

const emptyManifest = (): ProjectManifest => ({
  version: '0.1.0',
  name: 'p',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  characters: [],
  assets: { characters: 'a', backgrounds: 'b', bgm: 'c' },
  git: { initialized: false }
})

const makeFs = (initial: ProjectManifest): CharacterFs & {
  written: ProjectManifest[]
} => {
  const written: ProjectManifest[] = []
  return {
    written,
    readFile: async () => JSON.stringify(initial),
    writeFile: async (_p, content) => {
      written.push(JSON.parse(content) as ProjectManifest)
    }
  }
}

const makeGit = (): CharacterGit & { calls: Array<{ files: readonly string[]; msg: string }> } => {
  const calls: Array<{ files: readonly string[]; msg: string }> = []
  return {
    calls,
    addAndCommit: async (_p, files, msg) => {
      calls.push({ files, msg })
      return { ok: true, value: true }
    }
  }
}

describe('character-service', () => {
  describe('createCharacter', () => {
    it('appends character to manifest', async () => {
      const fs = makeFs(emptyManifest())
      const git = makeGit()
      const r = await createCharacter('/p', sampleCharacter, {
        fs,
        git,
        gitPrefs: { ...baseGitPrefs, autoCommitOnSave: false }
      })
      expect(r.ok).toBe(true)
      expect(fs.written[0]?.characters).toHaveLength(1)
      expect(fs.written[0]?.characters[0]?.id).toBe('char-1')
    })

    it('updates updatedAt', async () => {
      const fs = makeFs(emptyManifest())
      const git = makeGit()
      const before = Date.now()
      await createCharacter('/p', sampleCharacter, {
        fs,
        git,
        gitPrefs: { ...baseGitPrefs, autoCommitOnSave: false }
      })
      const after = Date.now()
      const ts = fs.written[0]?.updatedAt
      expect(ts).toBeDefined()
      expect(new Date(ts!).getTime()).toBeGreaterThanOrEqual(before)
      expect(new Date(ts!).getTime()).toBeLessThanOrEqual(after + 1000)
    })

    it('commits .galproj when autoCommitOnSave=true', async () => {
      const fs = makeFs(emptyManifest())
      const git = makeGit()
      await createCharacter('/p', sampleCharacter, {
        fs,
        git,
        gitPrefs: { ...baseGitPrefs, autoCommitOnSave: true }
      })
      expect(git.calls).toHaveLength(1)
      expect(git.calls[0]?.files).toEqual(['.galproj'])
      expect(git.calls[0]?.msg).toContain('小雪')
    })

    it('upsert: replacing existing id keeps single entry', async () => {
      const m = emptyManifest()
      m.characters = [sampleCharacter]
      const fs = makeFs(m)
      const git = makeGit()
      const updated: CharacterInput = { ...sampleCharacter, description: 'updated desc' }
      await createCharacter('/p', updated, { fs, git, gitPrefs: baseGitPrefs })
      expect(fs.written[0]?.characters).toHaveLength(1)
      expect(fs.written[0]?.characters[0]?.description).toBe('updated desc')
    })

    it('returns WRITE_FAILED when write throws', async () => {
      const fs: CharacterFs = {
        readFile: async () => JSON.stringify(emptyManifest()),
        writeFile: async () => {
          throw new Error('disk full')
        }
      }
      const git = makeGit()
      const r = await createCharacter('/p', sampleCharacter, { fs, git, gitPrefs: baseGitPrefs })
      expect(r.ok).toBe(false)
      if (r.ok !== true) expect(r.error.code).toBe('WRITE_FAILED')
    })
  })

  describe('updateCharacter', () => {
    it('replaces matching id only', async () => {
      const m = emptyManifest()
      m.characters = [
        sampleCharacter,
        { ...sampleCharacter, id: 'char-2', name: 'B' }
      ]
      const fs = makeFs(m)
      const git = makeGit()
      const updated: CharacterInput = { ...sampleCharacter, name: '小雪改' }
      await updateCharacter('/p', updated, { fs, git, gitPrefs: baseGitPrefs })
      expect(fs.written[0]?.characters).toHaveLength(2)
      expect(fs.written[0]?.characters.find((c) => c.id === 'char-1')?.name).toBe('小雪改')
      expect(fs.written[0]?.characters.find((c) => c.id === 'char-2')?.name).toBe('B')
    })

    it('commits when autoCommitOnSave=true', async () => {
      const m = emptyManifest()
      m.characters = [sampleCharacter]
      const fs = makeFs(m)
      const git = makeGit()
      await updateCharacter('/p', sampleCharacter, {
        fs,
        git,
        gitPrefs: { ...baseGitPrefs, autoCommitOnSave: true }
      })
      expect(git.calls).toHaveLength(1)
    })
  })

  describe('deleteCharacter', () => {
    it('removes by id', async () => {
      const m = emptyManifest()
      m.characters = [sampleCharacter, { ...sampleCharacter, id: 'char-2' }]
      const fs = makeFs(m)
      const git = makeGit()
      await deleteCharacter('/p', 'char-1', { fs, git, gitPrefs: baseGitPrefs })
      expect(fs.written[0]?.characters).toHaveLength(1)
      expect(fs.written[0]?.characters[0]?.id).toBe('char-2')
    })

    it('commits when autoCommitOnSave=true', async () => {
      const m = emptyManifest()
      m.characters = [sampleCharacter]
      const fs = makeFs(m)
      const git = makeGit()
      await deleteCharacter('/p', 'char-1', {
        fs,
        git,
        gitPrefs: { ...baseGitPrefs, autoCommitOnSave: true }
      })
      expect(git.calls).toHaveLength(1)
    })
  })

  describe('listCharacters', () => {
    it('returns ok=true with characters array', async () => {
      const m = emptyManifest()
      m.characters = [sampleCharacter]
      const fs = makeFs(m)
      const r = await listCharacters('/p', { fs })
      expect(r.ok).toBe(true)
      if (r.ok === true) {
        expect(r.value.characters).toHaveLength(1)
        expect(r.value.characters[0]?.id).toBe('char-1')
      }
    })

    it('returns READ_FAILED when read throws', async () => {
      const fs: CharacterFs = {
        readFile: async () => {
          throw new Error('EACCES')
        },
        writeFile: async () => undefined
      }
      const r = await listCharacters('/p', { fs })
      expect(r.ok).toBe(false)
      if (r.ok !== true) expect(r.code).toBe('READ_FAILED')
    })
  })
})
