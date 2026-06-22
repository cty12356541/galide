/**
 * context-engine — 为 agent 组装上下文(main 中心)
 *
 * 静态注入:角色表(.galproj)+ 场景索引(扫描 .gal)+ 选中场景明细 + git diff。
 * 带 token 预算:按优先级(选中场景 > 角色 > 场景索引 > git diff)拼装,
 * 超预算从低优先级尾部截断,保证高价值上下文优先进入 prompt。
 *
 * 可测性:磁盘 / git 通过依赖注入(ContextFs / ContextGit),测试用 memfs + mock git。
 * 规约:core/conventions.yaml「决策树在 .gal」「资产相对路径」;DI 见 testing-conventions。
 */
import { galScriptAbs, isGalScriptFileName, scriptsDirAbs } from '../../../shared/project-layout.js'
import { parse, collectSceneSummaries, type SceneSummary } from '../../../shared/dsl/parser.js'
import type { Result } from '../../../shared/dsl/types.js'
import { readGalproj } from '../../manifest/project-manifest.js'

export interface ContextFs {
  readFile: (path: string) => Promise<string>
  readdir: (path: string) => Promise<string[]>
}

export interface ContextGit {
  diff: (projectPath: string) => Promise<Result<string, { code: string; message: string }>>
}

export interface ContextEngineDeps {
  fs: ContextFs
  git: ContextGit
}

export interface ContextRequest {
  projectPath: string
  /** 当前编辑器选中的场景(只读上下文) */
  selectedSceneId?: string | null
  /** token 预算(近似 chars/4),默认 4000 */
  tokenBudget?: number
}

export interface ContextCharacter {
  id: string
  name: string
  description: string
  personality: string
}

export interface AssembledContext {
  characters: ContextCharacter[]
  scenes: SceneSummary[]
  selectedScene: SceneSummary | null
  gitDiff: string
  /** 拼装好的系统上下文文本(已按 token 预算截断) */
  text: string
  truncated: boolean
}

const DEFAULT_BUDGET = 4000

/** 近似 token 估算:按 4 字符 ≈ 1 token */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4)

const readCharacters = async (projectPath: string, fs: ContextFs): Promise<ContextCharacter[]> => {
  const r = await readGalproj(projectPath, (p) => fs.readFile(p))
  if (r.ok !== true) return []
  return (r.value.characters ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    personality: c.personality
  }))
}

const readScenes = async (projectPath: string, fs: ContextFs): Promise<SceneSummary[]> => {
  let files: string[] = []
  try {
    files = (await fs.readdir(scriptsDirAbs(projectPath)))
      .filter((f) => isGalScriptFileName(f))
      .sort()
  } catch {
    return []
  }
  const scenes: SceneSummary[] = []
  for (const file of files) {
    try {
      const src = await fs.readFile(galScriptAbs(projectPath, file))
      const result = parse(src)
      if (result.ok) scenes.push(...collectSceneSummaries(result.value, file))
    } catch {
      // 单文件解析失败不阻断整体上下文组装
    }
  }
  return scenes
}

type Section = { title: string; body: string }

const assembleText = (
  sections: readonly Section[],
  budget: number
): { text: string; truncated: boolean } => {
  const blocks = sections.map((s) => `## ${s.title}\n${s.body}`)
  if (blocks.length === 0) return { text: '', truncated: false }
  const kept = [...blocks]
  while (kept.length > 0 && estimateTokens(kept.join('\n\n')) > budget) {
    kept.pop()
  }
  return { text: kept.join('\n\n'), truncated: kept.length < blocks.length }
}

export const buildContext = async (
  req: ContextRequest,
  deps: ContextEngineDeps
): Promise<AssembledContext> => {
  const budget = req.tokenBudget ?? DEFAULT_BUDGET
  const characters = await readCharacters(req.projectPath, deps.fs)
  const scenes = await readScenes(req.projectPath, deps.fs)
  const selectedScene = req.selectedSceneId
    ? scenes.find((s) => s.id === req.selectedSceneId) ?? null
    : null

  let gitDiff = ''
  try {
    const dr = await deps.git.diff(req.projectPath)
    if (dr.ok) gitDiff = dr.value
  } catch {
    // git diff 失败(未初始化等)不阻断
  }

  // 优先级:选中场景 > 角色 > 场景索引 > git diff
  const sections: Section[] = []
  if (selectedScene) {
    sections.push({
      title: '当前选中场景',
      body: `${selectedScene.id} [${selectedScene.fileName}] 背景=${selectedScene.background ?? '-'} BGM=${selectedScene.bgm ?? '-'}`
    })
  }
  if (characters.length > 0) {
    sections.push({
      title: '角色',
      body: characters.map((c) => `- ${c.name}(${c.id}): ${c.personality} — ${c.description}`).join('\n')
    })
  }
  if (scenes.length > 0) {
    sections.push({
      title: '场景索引',
      body: scenes.map((s) => `- ${s.id} [${s.fileName}] 背景=${s.background ?? '-'}`).join('\n')
    })
  }
  if (gitDiff) {
    sections.push({ title: '最近改动 (git diff)', body: gitDiff })
  }

  const { text, truncated } = assembleText(sections, budget)
  return { characters, scenes, selectedScene, gitDiff, text, truncated }
}
