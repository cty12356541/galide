/**
 * SpriteLayer — PixiJS canvas wrapper with scene visual and character sprite updates
 */
import { useEffect, useMemo } from 'react'
import type { SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import type { VmGraph, VmState } from '../../../../shared/preview/runtime-vm'
import { getCurrentScene, computeStageState } from '../../../../shared/preview/runtime-vm'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { PreviewRuntime } from './PreviewRuntime'

const resolveAssetUrl = async (
  resolveAsync: (projectPath: string, relPath: string) => Promise<{ ok: boolean; dataUrl?: string }>,
  projectPath: string | null,
  relPath: string | undefined
): Promise<string | undefined> => {
  if (!relPath || !projectPath) return undefined
  const r = await resolveAsync(projectPath, relPath)
  return r.ok && r.dataUrl ? r.dataUrl : undefined
}

export const SpriteLayer = ({
  canvasRef,
  runtimeRef,
  vmGraph,
  vmState,
  viewAst,
  projectPath,
  resolveAsync
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  runtimeRef: React.MutableRefObject<PreviewRuntime | null>
  vmGraph: VmGraph | null
  vmState: VmState | null
  viewAst: ScriptNode | null
  projectPath: string | null
  resolveAsync: (projectPath: string, relPath: string) => Promise<{ ok: boolean; dataUrl?: string }>
}): JSX.Element => {
  const scenes = useMemo(
    () => (viewAst ? collectNodes(viewAst, (n): n is SceneNode => n.type === 'scene') : []),
    [viewAst]
  )

  const vmScene = vmGraph && vmState ? getCurrentScene(vmGraph, vmState) : null
  useEffect(() => {
    if (!vmScene || !runtimeRef.current) return
    const astScene = scenes.find((s) => s.id === vmScene.id) ?? null
    void runtimeRef.current.updateScene(astScene)
  }, [vmScene, scenes, runtimeRef])

  // 多角色舞台:从(场景, 位置)确定性推导全员立绘,含说话角色粘性更新
  const stageEntries = useMemo(() => {
    if (!vmGraph || !vmState) return []
    const stage = computeStageState(vmGraph, vmState)
    return Object.entries(stage).map(([character, slot]) => ({
      character,
      sprite: slot.sprite,
      position: slot.position ?? 'center'
    }))
  }, [vmGraph, vmState])

  useEffect(() => {
    if (!runtimeRef.current) return
    const syncStage = async (): Promise<void> => {
      const entries = await Promise.all(
        stageEntries.map(async (e) => ({
          character: e.character,
          url: await resolveAssetUrl(resolveAsync, projectPath, e.sprite),
          position: e.position
        }))
      )
      if (runtimeRef.current) {
        await runtimeRef.current.setStage(
          entries.filter((e): e is { character: string; url: string; position: 'left' | 'center' | 'right' } => !!e.url)
        )
      }
    }
    void syncStage()
  }, [stageEntries, projectPath, resolveAsync, runtimeRef])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      data-testid="preview-canvas"
    />
  )
}
