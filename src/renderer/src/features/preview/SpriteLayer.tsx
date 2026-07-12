/**
 * SpriteLayer — PixiJS canvas wrapper with scene visual and character sprite updates
 */
import { useEffect, useMemo } from 'react'
import type { SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'
import type { VmGraph, VmState } from '../../../../shared/preview/runtime-vm'
import { getCurrentScene, getCurrentStep } from '../../../../shared/preview/runtime-vm'
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
  const currentStep: PlaybackStep | null = vmGraph && vmState ? getCurrentStep(vmGraph, vmState) : null

  useEffect(() => {
    if (!vmScene || !runtimeRef.current) return
    const astScene = scenes.find((s) => s.id === vmScene.id) ?? null
    void runtimeRef.current.updateScene(astScene)
  }, [vmScene, scenes, runtimeRef])

  useEffect(() => {
    if (currentStep?.type !== 'dialogue' || !currentStep.sprite) return
    const syncSprite = async (): Promise<void> => {
      const url = await resolveAssetUrl(resolveAsync, projectPath, currentStep.sprite)
      if (url && runtimeRef.current) {
        await runtimeRef.current.setCharacter(url, currentStep.position ?? 'center')
      }
    }
    void syncSprite()
  }, [currentStep, projectPath, resolveAsync, runtimeRef])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      data-testid="preview-canvas"
    />
  )
}
