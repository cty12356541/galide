/**
 * character-sprite — .galproj 角色立绘字段补丁
 */
import { patchGalproj } from './project-manifest.js'

export const patchCharacterSpriteSet = async (
  projectPath: string,
  characterId: string,
  state: string,
  spritePath: string,
  readFile: (p: string) => Promise<string>,
  writeFile: (p: string, content: string) => Promise<void>
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const r = await patchGalproj(
    projectPath,
    (manifest) => {
      const idx = manifest.characters.findIndex((c) => c.id === characterId)
      if (idx < 0) throw new Error(`character ${characterId} not found`)
      const char = manifest.characters[idx]
      if (!char) throw new Error(`character ${characterId} not found`)
      const existing = char.spriteSet.findIndex((s) => s.state === state)
      const entry = { state, path: spritePath }
      if (existing >= 0) {
        char.spriteSet[existing] = entry
      } else {
        char.spriteSet = [...char.spriteSet, entry]
      }
      manifest.characters[idx] = char
    },
    { readFile, writeFile }
  )
  if (r.ok !== true) return { ok: false, error: r.error.message }
  return { ok: true }
}
