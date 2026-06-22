/**
 * usePreviewRuntime — PreviewCanvas mount-only Pixi/audio/voice 生命周期
 */
import { useEffect, type MutableRefObject, type RefObject } from 'react'
import { createPreviewRuntime, type PreviewRuntime } from './PreviewRuntime'
import { createPreviewAudioController } from './preview-audio'
import { createPreviewVoiceController } from './preview-voice'
import type { PreviewState } from './PreviewRuntime'
import type { SceneNode } from '../../../../shared/dsl/types'

export type UsePreviewRuntimeParams = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  runtimeRef: MutableRefObject<PreviewRuntime | null>
  audioRef: MutableRefObject<ReturnType<typeof createPreviewAudioController> | null>
  voiceRef: MutableRefObject<ReturnType<typeof createPreviewVoiceController> | null>
  sceneRef: MutableRefObject<SceneNode | null>
  sceneEmpty: boolean
  projectPath: string | null
  resolveAsync: (
    projectPath: string,
    relPath: string
  ) => Promise<{ ok: boolean; dataUrl?: string }>
  voiceApi: {
    generate: (
      projectPath: string,
      lineId: string,
      text: string,
      characterId: string
    ) => Promise<{ ok: boolean; path?: string; error?: string }>
  }
  setRuntimeState: (state: PreviewState) => void
  onVoiceError?: (message: string) => void
}

export const usePreviewRuntime = (params: UsePreviewRuntimeParams): void => {
  const {
    canvasRef,
    runtimeRef,
    audioRef,
    voiceRef,
    sceneRef,
    sceneEmpty,
    projectPath,
    resolveAsync,
    voiceApi,
    setRuntimeState,
    onVoiceError
  } = params

  // mount-only: projectPath/resolveAsync/voiceApi intentionally omitted
  // eslint-disable-next-line react-hooks/exhaustive-deps -- remount when sceneEmpty flips
  useEffect(() => {
    if (sceneEmpty) return
    if (!canvasRef.current) return

    const runtime = createPreviewRuntime()
    runtimeRef.current = runtime
    void runtime.mount(canvasRef.current).then(() => {
      if (runtimeRef.current === runtime && sceneRef.current) {
        void runtime.updateScene(sceneRef.current)
      }
    })
    const off = runtime.subscribeState(setRuntimeState)

    audioRef.current = createPreviewAudioController({
      createContext: () => new AudioContext(),
      loadAudio: async (url: string) => {
        const res = await fetch(url)
        return res.arrayBuffer()
      }
    })

    voiceRef.current = createPreviewVoiceController({
      resolveAudioUrl: async (relPath: string) => {
        if (!projectPath) return undefined
        const r = await resolveAsync(projectPath, relPath)
        return r.ok && r.dataUrl ? r.dataUrl : undefined
      },
      generateVoice: async (lineId, text, characterId) => {
        if (!projectPath) return { ok: false }
        return voiceApi.generate(projectPath, lineId, text, characterId)
      },
      onError: onVoiceError
    })

    return () => {
      off()
      runtime.unmount()
      runtimeRef.current = null
      audioRef.current?.dispose()
      audioRef.current = null
      voiceRef.current?.dispose()
      voiceRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only when sceneEmpty flips
  }, [sceneEmpty])
}
