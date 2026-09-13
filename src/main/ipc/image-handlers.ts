import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels.js'
import { generateSpriteService } from '../image/generate-sprite-service.js'
import { generateBackgroundService } from '../image/generate-background-service.js'
import {
  ipcSchemaFailure,
  parseIpcArgs,
  ImageGenerateSchema,
  ImageGenerateBackgroundSchema
} from './schemas/index.js'

export const registerImageHandlers = (): void => {
  ipcMain.handle(IPC.image.generateBackground, async (_e, raw: unknown) => {
    try {
      const req = parseIpcArgs('image:generateBackground', ImageGenerateBackgroundSchema, raw)
      const result = await generateBackgroundService({
        projectPath: req.projectPath,
        name: req.name,
        prompt: req.prompt,
        negativePrompt: req.negativePrompt,
        provider: req.provider,
        seed: req.seed,
        width: req.width,
        height: req.height
      })
      return result
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      return {
        ok: false as const,
        code: 'GENERATION_FAILED' as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })

  ipcMain.handle(IPC.image.generate, async (_e, raw: unknown) => {
    try {
      const req = parseIpcArgs('image:generate', ImageGenerateSchema, raw)
      const result = await generateSpriteService({
        projectPath: req.projectPath,
        characterId: req.characterId,
        state: req.state,
        prompt: req.prompt,
        provider: req.provider,
        seed: req.seed,
        baseUrl: req.baseUrl
      })
      return result
    } catch (err) {
      const fail = ipcSchemaFailure(err)
      if (fail.code === 'SCHEMA_FAILED') return fail
      return {
        ok: false as const,
        code: 'GENERATION_FAILED' as const,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })
}
