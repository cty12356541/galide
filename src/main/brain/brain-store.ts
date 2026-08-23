/**
 * brain-store — project-brain.json 读写仓库
 *
 * 模式与 agent-memory 同构(DI fs + 容错读),但 brain 是 canonical 数据:
 * 写入失败必须显式返回错误(不静默),读取损坏时返回空 brain 并标记 invalid。
 */
import { join } from 'node:path'
import {
  BRAIN_FILE_NAME,
  ProjectBrainSchema,
  emptyBrain,
  type Foreshadowing,
  type KnowledgeBoundary,
  type ProjectBrain,
  type Relationship
} from '../../shared/brain/schema.js'

export interface BrainReadFs {
  readFile: (path: string) => Promise<string>
}

export interface BrainFs extends BrainReadFs {
  writeFile: (path: string, content: string) => Promise<void>
}

export type BrainReadResult = {
  ok: true
  brain: ProjectBrain
  existed: boolean
  /** 文件存在但内容损坏(已回退为空 brain) */
  invalid?: boolean
}

export const brainPath = (projectPath: string): string => join(projectPath, BRAIN_FILE_NAME)

/** 读 brain;不存在 → 空 brain;损坏 → 空 brain + invalid 标记 */
export const readBrain = async (
  projectPath: string,
  fs: BrainReadFs
): Promise<BrainReadResult> => {
  let raw: string
  try {
    raw = await fs.readFile(brainPath(projectPath))
  } catch {
    return { ok: true, brain: emptyBrain(), existed: false }
  }
  const parsed = ProjectBrainSchema.safeParse(jsonLoose(raw))
  if (parsed.success) return { ok: true, brain: parsed.data, existed: true }
  return { ok: true, brain: emptyBrain(), existed: true, invalid: true }
}

const jsonLoose = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const writeBrain = async (
  projectPath: string,
  brain: ProjectBrain,
  fs: BrainFs
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    await fs.writeFile(brainPath(projectPath), JSON.stringify(brain, null, 2))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

const nowIso = (): string => new Date().toISOString()

export const upsertForeshadowing = async (
  projectPath: string,
  entry: Omit<Foreshadowing, 'updatedAt'>,
  fs: BrainFs
): Promise<BrainReadResult & { write?: { ok: boolean; error?: string } }> => {
  const r = await readBrain(projectPath, fs)
  const next: Foreshadowing = { ...entry, updatedAt: nowIso() }
  const idx = r.brain.foreshadowings.findIndex((f) => f.id === entry.id)
  if (idx >= 0) r.brain.foreshadowings[idx] = next
  else r.brain.foreshadowings.push(next)
  const write = await writeBrain(projectPath, r.brain, fs)
  return { ...r, brain: r.brain, write }
}

export const upsertRelationship = async (
  projectPath: string,
  entry: Pick<Relationship, 'characterA' | 'characterB'> & Partial<Relationship>,
  fs: BrainFs
): Promise<BrainReadResult & { write?: { ok: boolean; error?: string } }> => {
  const r = await readBrain(projectPath, fs)
  const id =
    entry.id ?? `rel-${[entry.characterA, entry.characterB].sort().join('-')}`
  const existing = r.brain.relationships.find(
    (rel) =>
      rel.id === id ||
      (rel.characterA === entry.characterA && rel.characterB === entry.characterB) ||
      (rel.characterA === entry.characterB && rel.characterB === entry.characterA)
  )
  if (existing) {
    existing.description = entry.description ?? existing.description
    if (entry.stages) existing.stages.push(...entry.stages)
    existing.updatedAt = nowIso()
  } else {
    r.brain.relationships.push({
      id,
      characterA: entry.characterA,
      characterB: entry.characterB,
      description: entry.description ?? '',
      stages: entry.stages ?? [],
      updatedAt: nowIso()
    })
  }
  const write = await writeBrain(projectPath, r.brain, fs)
  return { ...r, write }
}

export const upsertKnowledge = async (
  projectPath: string,
  entry: Omit<KnowledgeBoundary, 'updatedAt' | 'id'> & { id?: string },
  fs: BrainFs
): Promise<BrainReadResult & { write?: { ok: boolean; error?: string } }> => {
  const r = await readBrain(projectPath, fs)
  const generatedId =
    entry.id ??
    `kb-${Buffer.from(`${entry.condition}|${entry.fact}`).toString('base64url').slice(0, 24)}`
  const next: KnowledgeBoundary = { ...entry, id: generatedId, updatedAt: nowIso() }
  const idx = r.brain.knowledgeBoundaries.findIndex(
    (k) => k.id === entry.id || (k.condition === entry.condition && k.fact === entry.fact)
  )
  if (idx >= 0) next.id = r.brain.knowledgeBoundaries[idx]!.id
  if (idx >= 0) r.brain.knowledgeBoundaries[idx] = next
  else r.brain.knowledgeBoundaries.push(next)
  const write = await writeBrain(projectPath, r.brain, fs)
  return { ...r, write }
}

/** agent 上下文用摘要(未回收伏笔数 + 关系现状 + 知识边界要点) */
export const formatBrainSummary = (brain: ProjectBrain): string => {
  const lines: string[] = []
  const open = brain.foreshadowings.filter((f) => f.status === 'planted')
  if (brain.foreshadowings.length > 0) {
    lines.push(
      `伏笔(${open.length} 未回收/${brain.foreshadowings.length} 总数):`,
      ...brain.foreshadowings.map(
        (f) =>
          `- [${f.status === 'planted' ? '未回收' : f.status === 'resolved' ? '已回收' : '已放弃'}] ${f.description}${f.plantedInSceneId ? `(埋于 ${f.plantedInSceneId})` : ''}`
      )
    )
  }
  if (brain.relationships.length > 0) {
    lines.push(
      '角色关系:',
      ...brain.relationships.map(
        (r) => `- ${r.characterA} × ${r.characterB}: ${r.description}`
      )
    )
  }
  if (brain.knowledgeBoundaries.length > 0) {
    lines.push(
      '路线知识边界:',
      ...brain.knowledgeBoundaries.map(
        (k) => `- 当 ${k.condition}: ${k.fact}(${k.known ? '已知' : '未知'})`
      )
    )
  }
  return lines.join('\n')
}
