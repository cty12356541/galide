/**
 * context-engine — 为 agent 组装上下文(main 中心)
 *
 * 静态注入:角色表(.galproj)+ 场景索引(扫描 .gal)+ 选中场景明细 + git diff。
 * 带 token 预算:按优先级(选中场景 > 角色 > 场景索引 > git diff)拼装,
 * 高优先级 section 内部截断,再整段丢弃低优先级 section。
 *
 * 可测性:磁盘 / git 通过依赖注入(ContextFs / ContextGit),测试用 memfs + mock git。
 * 规约:core/conventions.yaml「决策树在 .gal」「资产相对路径」;DI 见 testing-conventions。
 */
import { galScriptAbs, isGalScriptFileName, scriptsDirAbs } from '../../../shared/project-layout.js'
import { parse, collectSceneSummaries, collectScenes, type SceneSummary } from '../../../shared/dsl/parser.js'
import type { AstNode, Result, SceneNode } from '../../../shared/dsl/types.js'
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
  /** 当前活跃 .gal 文件(优先在此文件查找选中场景) */
  activeScriptFile?: string | null
  /** token 预算(近似 chars/4),默认 4000 */
  tokenBudget?: number
  /** 跨会话记忆文本(由 agent-service 加载注入;最低优先级,超预算先截断) */
  memoryText?: string
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
  selectedSceneExcerpt?: string
  gitDiff: string
  /** 拼装好的系统上下文文本(已按 token 预算截断) */
  text: string
  truncated: boolean
}

const DEFAULT_BUDGET = 4000

/** 近似 token 估算:按 4 字符 ≈ 1 token */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4)

/** section 内部截断(保留头部) */
export const truncateToTokens = (text: string, maxTokens: number): string => {
  if (maxTokens <= 0) return ''
  const maxChars = maxTokens * 4
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n…(已截断)`
}

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

const summarizeNode = (node: AstNode): string | null => {
  switch (node.type) {
    case 'dialogue':
      return `- ${node.character}: "${node.lines.join(' ')}"`
    case 'choice':
      return `- [选项] ${node.options.map((o) => `"${o.text}"→${o.target}`).join(' | ')}`
    case 'goto':
      return `- [跳转] → ${node.target}`
    case 'set':
      return `- [设变量] ${node.name}`
    case 'if':
      return `- [条件块] ${node.branches.length} 分支`
    case 'marker':
      return `- [标记] === ${node.id} ===`
    default:
      return null
  }
}

export const summarizeScene = (scene: SceneNode): string => {
  const lines: string[] = []
  for (const child of scene.children) {
    const line = summarizeNode(child)
    if (line) lines.push(line)
  }
  return lines.length > 0 ? lines.join('\n') : '(空场景)'
}

const loadSceneNode = async (
  projectPath: string,
  fs: ContextFs,
  sceneId: string,
  activeScriptFile?: string | null
): Promise<SceneNode | null> => {
  const tryFile = async (fileName: string): Promise<SceneNode | null> => {
    try {
      const src = await fs.readFile(galScriptAbs(projectPath, fileName))
      const result = parse(src)
      if (!result.ok) return null
      const scene = collectScenes(result.value).find((s) => s.id === sceneId)
      return scene ?? null
    } catch {
      return null
    }
  }

  if (activeScriptFile && isGalScriptFileName(activeScriptFile)) {
    const fromActive = await tryFile(activeScriptFile)
    if (fromActive) return fromActive
  }

  let files: string[] = []
  try {
    files = (await fs.readdir(scriptsDirAbs(projectPath)))
      .filter((f) => isGalScriptFileName(f))
      .sort()
  } catch {
    return null
  }
  for (const file of files) {
    const scene = await tryFile(file)
    if (scene) return scene
  }
  return null
}

type Section = { title: string; body: string; priority: number }

const assembleText = (
  sections: readonly Section[],
  budget: number
): { text: string; truncated: boolean } => {
  if (sections.length === 0) return { text: '', truncated: false }

  const sorted = [...sections].sort((a, b) => a.priority - b.priority)
  const bodies = sorted.map((s) => ({ ...s, body: s.body }))
  let truncated = false

  const totalTokens = (): number =>
    estimateTokens(bodies.map((s) => `## ${s.title}\n${s.body}`).join('\n\n'))

  if (totalTokens() > budget) {
    for (let i = 0; i < bodies.length && totalTokens() > budget; i++) {
      const sec = bodies[i]!
      const others = bodies.filter((_, j) => j !== i)
      const othersTokens = estimateTokens(
        others.map((s) => `## ${s.title}\n${s.body}`).join('\n\n')
      )
      const allowance = Math.max(budget - othersTokens - estimateTokens(`## ${sec.title}\n`), 0)
      if (allowance < estimateTokens(sec.body)) {
        sec.body = truncateToTokens(sec.body, allowance)
        truncated = true
      }
    }
  }

  while (bodies.length > 0 && totalTokens() > budget) {
    bodies.pop()
    truncated = true
  }

  const blocks = bodies.map((s) => `## ${s.title}\n${s.body}`)
  return { text: blocks.join('\n\n'), truncated }
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

  let selectedSceneExcerpt: string | undefined
  if (req.selectedSceneId) {
    const sceneNode = await loadSceneNode(
      req.projectPath,
      deps.fs,
      req.selectedSceneId,
      req.activeScriptFile
    )
    if (sceneNode) selectedSceneExcerpt = summarizeScene(sceneNode)
  }

  let gitDiff = ''
  try {
    const dr = await deps.git.diff(req.projectPath)
    if (dr.ok) gitDiff = dr.value
  } catch {
    // git diff 失败(未初始化等)不阻断
  }

  const sections: Section[] = []
  if (selectedScene) {
    const meta = `${selectedScene.id} [${selectedScene.fileName}] 背景=${selectedScene.background ?? '-'} BGM=${selectedScene.bgm ?? '-'}`
    const body = selectedSceneExcerpt ? `${meta}\n\n对白摘要:\n${selectedSceneExcerpt}` : meta
    sections.push({ title: '当前选中场景', body, priority: 0 })
  }
  if (characters.length > 0) {
    sections.push({
      title: '角色',
      body: characters.map((c) => `- ${c.name}(${c.id}): ${c.personality} — ${c.description}`).join('\n'),
      priority: 1
    })
  }
  if (scenes.length > 0) {
    sections.push({
      title: '场景索引',
      body: scenes.map((s) => `- ${s.id} [${s.fileName}] 背景=${s.background ?? '-'}`).join('\n'),
      priority: 2
    })
  }
  if (gitDiff) {
    sections.push({ title: '最近改动 (git diff)', body: gitDiff, priority: 3 })
  }
  if (req.memoryText) {
    sections.push({ title: '先前会话(agent 记忆)', body: req.memoryText, priority: 4 })
  }

  const { text, truncated } = assembleText(sections, budget)
  return {
    characters,
    scenes,
    selectedScene,
    selectedSceneExcerpt,
    gitDiff,
    text,
    truncated
  }
}
