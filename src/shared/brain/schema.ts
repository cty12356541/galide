/**
 * Project Brain schema — 与 .gal 同级的 canonical 叙事知识数据
 *
 * 存储: 项目根 project-brain.json(进 Git,区别于 .galide/ 机器本地状态)。
 * 覆盖长篇创作最关键的三类一致性知识:
 *   - foreshadowing: 伏笔账本(埋设/回收状态)
 *   - relationship:  角色关系及其阶段变化
 *   - knowledgeBoundary: 路线知识边界(某信息在某路线已知/未知)
 */
import * as z from 'zod/v4'

export const BRAIN_FILE_NAME = 'project-brain.json'
export const BRAIN_VERSION = '0.1.0' as const

export const ForeshadowingStatusSchema = z.enum(['planted', 'resolved', 'abandoned'])

export const ForeshadowingSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  /** 埋设位置(场景 id,可选文件名) */
  plantedInSceneId: z.string().min(1).optional(),
  plantedInFile: z.string().optional(),
  /** 预期回收说明(自由文本,可含目标场景) */
  expectedPayoff: z.string().optional(),
  status: ForeshadowingStatusSchema,
  updatedAt: z.string()
})

export const RelationshipStageSchema = z.object({
  note: z.string().min(1),
  /** 变化发生时间/场景线索(自由文本) */
  at: z.string().optional()
})

export const RelationshipSchema = z.object({
  id: z.string().min(1),
  characterA: z.string().min(1),
  characterB: z.string().min(1),
  /** 当前关系描述 */
  description: z.string().min(1),
  /** 阶段历史(追加,不改写) */
  stages: z.array(RelationshipStageSchema),
  updatedAt: z.string()
})

export const KnowledgeBoundarySchema = z.object({
  id: z.string().min(1),
  /** 路线/条件表达式(如 route==true 或变量条件) */
  condition: z.string().min(1),
  /** 信息内容 */
  fact: z.string().min(1),
  /** 该条件下角色/叙事是否已知此信息 */
  known: z.boolean(),
  note: z.string().optional(),
  updatedAt: z.string()
})

export const ProjectBrainSchema = z.object({
  version: z.literal(BRAIN_VERSION),
  foreshadowings: z.array(ForeshadowingSchema),
  relationships: z.array(RelationshipSchema),
  knowledgeBoundaries: z.array(KnowledgeBoundarySchema)
})

export type Foreshadowing = z.infer<typeof ForeshadowingSchema>
export type ForeshadowingStatus = z.infer<typeof ForeshadowingStatusSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type RelationshipStage = z.infer<typeof RelationshipStageSchema>
export type KnowledgeBoundary = z.infer<typeof KnowledgeBoundarySchema>
export type ProjectBrain = z.infer<typeof ProjectBrainSchema>

export const emptyBrain = (): ProjectBrain => ({
  version: BRAIN_VERSION,
  foreshadowings: [],
  relationships: [],
  knowledgeBoundaries: []
})
