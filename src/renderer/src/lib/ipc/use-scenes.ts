import { useCallback } from 'react'
import { collectScenes } from '../../../../shared/dsl/parser'
import type { ScriptNode, SceneNode } from '../../../../shared/dsl/types'
import { useErrorStore } from '../store'
import { useScript } from './use-script'

/**
 * 场景摘要:从 .gal 文件派生的运行时视图。
 * 不存入 .galproj(决策树不在 .galproj 中冗余存储,见 core/conventions.yaml)。
 */
export interface SceneSummary {
  id: string
  fileName: string
  title: string
  background?: string
  bgm?: string
}

type ListResult =
  | { ok: true; value: SceneSummary[] }
  | { ok: false; error: string }

const wrap = async <T>(source: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: err instanceof Error ? err.message : String(err),
      source
    })
    return undefined
  }
}

const summarize = (fileName: string, scenes: SceneNode[]): SceneSummary[] =>
  scenes.map((scene) => ({
    id: scene.id,
    fileName,
    title: scene.id,
    background: scene.background,
    bgm: scene.bgm
  }))

const collectFromAst = (ast: ScriptNode, fileName: string): SceneSummary[] =>
  summarize(fileName, collectScenes(ast))

/**
 * 场景列表 hook:基于 .gal 文件扫描派生,不再依赖 ProjectManifest.scenes。
 * - `list(projectPath)`:返回该目录下所有 .gal 文件解析出的 SceneSummary[]
 * - `listFromAst(ast, fileName)`:对已解析 AST 提取场景(供编辑器内本地使用)
 */
export const useScenes = () => {
  const script = useScript()

  const list = useCallback(
    (projectPath: string): Promise<ListResult | undefined> =>
      wrap('script:list-scenes', async () => {
        const files = await script.list(projectPath)
        if (!files) return { ok: false as const, error: 'failed to list scripts' }
        const summaries: SceneSummary[] = []
        for (const fileName of files) {
          const source = await script.read(projectPath, fileName)
          if (source === undefined) continue
          const parsed = await script.parse(source)
          if (!parsed.ok) continue
          summaries.push(...collectFromAst(parsed.value, fileName))
        }
        return { ok: true as const, value: summaries }
      }),
    [script]
  )

  const listFromAst = useCallback((ast: ScriptNode, fileName: string): SceneSummary[] => {
    return collectFromAst(ast, fileName)
  }, [])

  return { list, listFromAst }
}
