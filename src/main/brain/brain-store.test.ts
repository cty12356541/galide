/**
 * brain-store 单测 — 读写 / 容错 / upsert 语义
 */
import { describe, it, expect } from 'vitest'
import {
  brainPath,
  readBrain,
  upsertForeshadowing,
  upsertRelationship,
  upsertKnowledge,
  formatBrainSummary
} from './brain-store.js'
import { emptyBrain } from '../../shared/brain/schema.js'

const makeFs = (initial: Record<string, string> = {}) => {
  const files = { ...initial }
  return {
    files,
    fs: {
      readFile: async (p: string): Promise<string> => {
        if (!(p in files)) throw new Error(`ENOENT: ${p}`)
        return files[p]!
      },
      writeFile: async (p: string, c: string): Promise<void> => {
        files[p] = c
      }
    }
  }
}

describe('readBrain', () => {
  it('文件不存在 → 空 brain,existed=false', async () => {
    const { fs } = makeFs()
    const r = await readBrain('/proj', fs)
    expect(r.ok).toBe(true)
    expect(r.brain).toEqual(emptyBrain())
    expect(r.existed).toBe(false)
  })

  it('损坏 JSON → 空 brain + invalid 标记', async () => {
    const { fs } = makeFs({ [brainPath('/proj')]: '{oops' })
    const r = await readBrain('/proj', fs)
    expect(r.ok).toBe(true)
    expect(r.brain).toEqual(emptyBrain())
    expect(r.existed).toBe(true)
    expect('invalid' in r && r.invalid).toBe(true)
  })

  it('合法 brain 正常读取', async () => {
    const { fs } = makeFs({
      [brainPath('/proj')]: JSON.stringify({
        version: '0.1.0',
        foreshadowings: [
          { id: 'f1', description: '怀表', status: 'planted', updatedAt: '2026-01-01T00:00:00Z' }
        ],
        relationships: [],
        knowledgeBoundaries: []
      })
    })
    const r = await readBrain('/proj', fs)
    expect(r.brain.foreshadowings).toHaveLength(1)
  })
})

describe('upsertForeshadowing', () => {
  it('新增后同 id 覆盖更新', async () => {
    const { fs } = makeFs()
    const r1 = await upsertForeshadowing(
      '/proj',
      { id: 'f1', description: '怀表', status: 'planted' },
      fs
    )
    expect(r1.write?.ok).toBe(true)
    await upsertForeshadowing(
      '/proj',
      { id: 'f1', description: '怀表', status: 'resolved' },
      fs
    )
    const r = await readBrain('/proj', fs)
    expect(r.brain.foreshadowings).toHaveLength(1)
    expect(r.brain.foreshadowings[0]!.status).toBe('resolved')
  })
})

describe('upsertRelationship', () => {
  it('按角色对定位(顺序无关),stages 追加不改写', async () => {
    const { fs } = makeFs()
    await upsertRelationship(
      '/proj',
      { characterA: 'alice', characterB: 'bob', description: '初识', stages: [{ note: '相遇' }] },
      fs
    )
    // 反序角色对仍命中同一条
    await upsertRelationship(
      '/proj',
      { characterB: 'alice', characterA: 'bob', description: '互信', stages: [{ note: '共历危险' }] },
      fs
    )
    const r = await readBrain('/proj', fs)
    expect(r.brain.relationships).toHaveLength(1)
    expect(r.brain.relationships[0]!.description).toBe('互信')
    expect(r.brain.relationships[0]!.stages).toHaveLength(2)
  })
})

describe('upsertKnowledge', () => {
  it('同 condition+fact 更新而非新增', async () => {
    const { fs } = makeFs()
    await upsertKnowledge('/proj', { id: 'k1', condition: 'route_b', fact: '身世', known: false }, fs)
    await upsertKnowledge('/proj', { id: 'k2', condition: 'route_b', fact: '身世', known: true }, fs)
    const r = await readBrain('/proj', fs)
    expect(r.brain.knowledgeBoundaries).toHaveLength(1)
    expect(r.brain.knowledgeBoundaries[0]!.known).toBe(true)
    expect(r.brain.knowledgeBoundaries[0]!.id).toBe('k1')
  })
})

describe('formatBrainSummary', () => {
  it('包含未回收伏笔数 / 关系 / 知识边界', () => {
    const text = formatBrainSummary({
      version: '0.1.0',
      foreshadowings: [
        { id: 'f1', description: '怀表', status: 'planted', updatedAt: 't' },
        { id: 'f2', description: '旧伤', status: 'resolved', updatedAt: 't' }
      ],
      relationships: [
        {
          id: 'rel-a-b',
          characterA: 'a',
          characterB: 'b',
          description: '挚友',
          stages: [],
          updatedAt: 't'
        }
      ],
      knowledgeBoundaries: [
        { id: 'k1', condition: 'route_b', fact: '身世', known: false, updatedAt: 't' }
      ]
    })
    expect(text).toContain('1 未回收/2 总数')
    expect(text).toContain('未回收')
    expect(text).toContain('a × b: 挚友')
    expect(text).toContain('当 route_b')
  })

  it('空 brain → 空串(context 不产生空 section)', () => {
    expect(formatBrainSummary(emptyBrain())).toBe('')
  })
})
