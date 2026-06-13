/**
 * manifest schema 校验单测
 * 规约: layers/main-process/conventions.yaml — manifest schema 必须校验,拒绝坏数据
 */
import { describe, it, expect } from 'vitest'
import { parseManifest, type ManifestValidationError } from './manifest-schema.js'

const validManifest = {
  version: '0.1.0',
  name: 'My Project',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  characters: [
    {
      id: 'c1',
      name: '小雪',
      description: 'd',
      personality: 'p',
      spriteSet: [{ state: 'default', path: 'assets/c.png' }]
    }
  ],
  assets: {
    characters: 'assets/characters',
    backgrounds: 'assets/backgrounds',
    bgm: 'assets/bgm'
  },
  git: { initialized: true }
}

describe('parseManifest', () => {
  it('accepts a valid v0.1.0 manifest', () => {
    const r = parseManifest(JSON.stringify(validManifest))
    expect(r.ok).toBe(true)
  })

  it('accepts manifest without git field (optional)', () => {
    const m = { ...validManifest }
    delete (m as Partial<typeof validManifest>).git
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(true)
  })

  it('rejects non-string input', () => {
    const r = parseManifest('null')
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('INVALID_JSON')
  })

  it('rejects missing version', () => {
    const m = { ...validManifest } as Record<string, unknown>
    delete m['version']
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('SCHEMA_FAILED')
  })

  it('rejects wrong version string', () => {
    const m = { ...validManifest, version: '99.0.0' }
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('UNSUPPORTED_VERSION')
  })

  it('rejects malformed JSON', () => {
    const r = parseManifest('{not json}')
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('INVALID_JSON')
  })

  it('rejects when assets.bg field missing', () => {
    const m = {
      ...validManifest,
      assets: { characters: 'a', backgrounds: 'b' }
    }
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('SCHEMA_FAILED')
  })

  it('rejects when characters item missing required field', () => {
    const m = {
      ...validManifest,
      characters: [{ id: 'c1', name: 'x' }] // 缺 description/personality/spriteSet
    }
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(false)
    if (r.ok !== true) expect(r.error.code).toBe('SCHEMA_FAILED')
  })

  it('error.message contains path for schema issues', () => {
    const m = { ...validManifest, name: 12345 }
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(false)
    if (r.ok !== true) {
      expect(r.error.message).toMatch(/name/)
    }
  })

  it('error.message mentions the issue for unsupported version', () => {
    const m = { ...validManifest, version: '99.0.0' }
    const r = parseManifest(JSON.stringify(m))
    expect(r.ok).toBe(false)
    if (r.ok !== true) {
      expect(r.error.message).toContain('99.0.0')
    }
  })
})

describe('ManifestValidationError shape', () => {
  it('matches the contract', () => {
    const r = parseManifest('null')
    if (r.ok !== true) {
      const e: ManifestValidationError = r.error
      expect(['INVALID_JSON', 'SCHEMA_FAILED', 'UNSUPPORTED_VERSION']).toContain(e.code)
      expect(typeof e.message).toBe('string')
    }
  })
})
