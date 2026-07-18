import { describe, expect, it } from 'vitest'
import { LineIdSchema, multimodalTools } from './multimodal-tools.js'
import type { ToolContext } from '../types.js'

const generateVoice = multimodalTools.find((t) => t.name === 'generate_voice')!
const generateVoiceBatch = multimodalTools.find((t) => t.name === 'generate_voice_batch')!

const ctx: ToolContext = {
  projectPath: '/proj',
  fs: { readFile: async () => '', writeFile: async () => undefined, readdir: async () => [] }
}

describe('LineIdSchema', () => {
  it('accepts safe lineId', () => {
    expect(LineIdSchema.safeParse('line_001').success).toBe(true)
  })

  it('rejects lineId with path traversal', () => {
    expect(LineIdSchema.safeParse('../../../etc/passwd').success).toBe(false)
  })

  it('rejects lineId with slashes', () => {
    expect(LineIdSchema.safeParse('chapter1/line1').success).toBe(false)
  })

  it('rejects lineId with backslashes', () => {
    expect(LineIdSchema.safeParse('chapter1\\line1').success).toBe(false)
  })

  it('rejects lineId with dots only', () => {
    expect(LineIdSchema.safeParse('..').success).toBe(false)
  })
})

describe('generateVoice lineId validation', () => {
  it('rejects lineId with path traversal', async () => {
    const r = await generateVoice.run({ lineId: '../../../etc/passwd', text: 'hello', characterId: 'c1' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('SCHEMA_FAILED')
  })

  it('rejects lineId with slashes', async () => {
    const r = await generateVoice.run({ lineId: 'chapter1/line1', text: 'hello', characterId: 'c1' }, ctx)
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('SCHEMA_FAILED')
  })

  it('batch also rejects malicious lineId', async () => {
    const r = await generateVoiceBatch.run(
      { items: [{ lineId: '../../../etc/passwd', text: 'hello', characterId: 'c1' }] },
      ctx
    )
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('SCHEMA_FAILED')
  })
})
