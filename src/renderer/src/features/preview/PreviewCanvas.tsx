import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Square, Box, Volume2, VolumeX, Save, FolderOpen } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { useUiStore, useErrorStore } from '../../lib/store'
import { useAsset } from '../../lib/ipc/use-asset'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'
import {
  advanceVm,
  buildVmGraph,
  createVmState,
  executeGotoStep,
  getCurrentScene,
  getCurrentStep,
  jumpToTarget,
  type VmGraph,
  type VmState
} from '../../../../shared/preview/runtime-vm'
import type { PreviewState } from './PreviewRuntime'
import { motion } from 'framer-motion'
import type { PreviewRuntime } from './PreviewRuntime'
import { createPreviewAudioController } from './preview-audio'
import { createPreviewVoiceController } from './preview-voice'
import { usePreviewSave } from '../../lib/ipc/use-preview-save'
import { PREVIEW_SAVE_SLOT_COUNT } from '../../../../shared/preview/vm-save'
import { ProjectParseErrorBanner } from '../../components/ui/project-parse-error-banner'
import { usePreference } from '../../lib/ipc/use-preferences'
import { useVoice } from '../../lib/ipc/use-voice'
import { usePreviewRuntime } from './use-preview-runtime'

const collectScenes = (ast: ScriptNode): SceneNode[] =>
  collectNodes(ast, (n): n is SceneNode => n.type === 'scene')

const resolveAssetUrl = async (
  resolveAsync: (projectPath: string, relPath: string) => Promise<{ ok: boolean; dataUrl?: string }>,
  projectPath: string | null,
  relPath: string | undefined
): Promise<string | undefined> => {
  if (!relPath || !projectPath) return undefined
  const r = await resolveAsync(projectPath, relPath)
  return r.ok && r.dataUrl ? r.dataUrl : undefined
}

export const PreviewCanvas = (): JSX.Element => {
  const scriptAst = useUiStore((s) => s.scriptAst)
  const projectMergedAst = useUiStore((s) => s.projectMergedAst)
  const projectParseError = useUiStore((s) => s.projectParseError)
  const manifest = useUiStore((s) => s.manifest)
  const viewAst = projectMergedAst ?? scriptAst
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const projectPath = useUiStore((s) => s.projectPath)
  const { resolveAsync } = useAsset()
  const { saveSlot, loadSlot } = usePreviewSave(projectPath)
  const voicePrefsQuery = usePreference('voice')
  const voiceApi = useVoice()
  const pushError = useErrorStore((s) => s.push)
  const previewTtsEnabled = voicePrefsQuery.data?.previewEnabled === true

  const [saveNote, setSaveNote] = useState<string | null>(null)

  const [vmState, setVmState] = useState<VmState | null>(null)
  const [runtimeState, setRuntimeState] = useState<PreviewState>('idle')
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [unsupportedNote, setUnsupportedNote] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<PreviewRuntime | null>(null)
  const audioRef = useRef<ReturnType<typeof createPreviewAudioController> | null>(null)
  const voiceRef = useRef<ReturnType<typeof createPreviewVoiceController> | null>(null)
  const sceneRef = useRef<SceneNode | null>(null)

  const vmGraph = useMemo<VmGraph | null>(
    () => (viewAst ? buildVmGraph(viewAst) : null),
    [viewAst]
  )

  const scenes = useMemo(
    () => (viewAst ? collectScenes(viewAst) : []),
    [viewAst]
  )

  const scene = useMemo<SceneNode | null>(() => {
    if (scenes.length === 0) return null
    return scenes.find((s) => s.id === selectedSceneId) ?? scenes[0] ?? null
  }, [scenes, selectedSceneId])

  sceneRef.current = scene
  const sceneEmpty = scene === null
  const sceneId = vmState?.sceneId ?? scene?.id ?? null

  const currentStep = useMemo<PlaybackStep | null>(() => {
    if (!vmGraph || !vmState) return null
    return getCurrentStep(vmGraph, vmState)
  }, [vmGraph, vmState])

  const vmScene = useMemo(() => {
    if (!vmGraph || !vmState) return null
    return getCurrentScene(vmGraph, vmState)
  }, [vmGraph, vmState])

  // Sync VM to selected scene when scene changes externally
  useEffect(() => {
    if (!vmGraph || !scene?.id) return
    setVmState(createVmState(vmGraph, scene.id))
    setUnsupportedNote(null)
  }, [vmGraph, scene?.id])

  usePreviewRuntime({
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
    onVoiceError: (message) =>
      pushError({ code: 'PREVIEW_TTS_FAILED', message, source: 'preview:tts' })
  })

  // Scene visual + BGM update when VM scene changes
  useEffect(() => {
    if (!vmScene || !runtimeRef.current) return
    const astScene = scenes.find((s) => s.id === vmScene.id) ?? null
    void runtimeRef.current.updateScene(astScene)

    const syncAudio = async (): Promise<void> => {
      const audio = audioRef.current
      if (!audio || !vmScene.bgm) {
        audio?.stop()
        return
      }
      const url = await resolveAssetUrl(resolveAsync, projectPath, vmScene.bgm)
      if (url) {
        await audio.play(vmScene.bgm, url)
      }
    }
    void syncAudio()
  }, [vmScene, scenes, projectPath, resolveAsync])

  // Sprite update on dialogue steps
  useEffect(() => {
    if (currentStep?.type !== 'dialogue' || !currentStep.sprite) return
    const syncSprite = async (): Promise<void> => {
      const url = await resolveAssetUrl(resolveAsync, projectPath, currentStep.sprite)
      if (url && runtimeRef.current) {
        await runtimeRef.current.setCharacter(url, currentStep.position ?? 'center')
      }
    }
    void syncSprite()
  }, [currentStep, projectPath, resolveAsync])

  useEffect(() => {
    audioRef.current?.setMuted(muted)
    voiceRef.current?.setMuted(muted)
  }, [muted])

  useEffect(() => {
    audioRef.current?.setVolume(volume)
  }, [volume])

  const resolveCharacterId = useCallback(
    (displayName: string): string => {
      const chars = manifest?.characters ?? []
      const hit = chars.find((c) => c.name === displayName || c.id === displayName)
      return hit?.id ?? displayName
    },
    [manifest?.characters]
  )

  // Preview TTS on dialogue steps
  useEffect(() => {
    if (!previewTtsEnabled || currentStep?.type !== 'dialogue' || !vmState || !sceneId) return
    const lineId = `${sceneId}-${vmState.stepIndex}`
    const characterId = resolveCharacterId(currentStep.character)
    void voiceRef.current?.playDialogue(lineId, currentStep.text, characterId)
  }, [currentStep, previewTtsEnabled, vmState, sceneId, resolveCharacterId])

  // Auto-advance invisible set steps
  useEffect(() => {
    if (currentStep?.type !== 'set' || !vmGraph || !vmState) return
    const result = advanceVm(vmGraph, vmState)
    if (result.ok) setVmState(result.state)
  }, [currentStep, vmGraph, vmState])

  const advance = useCallback((): void => {
    if (!vmGraph || !vmState) return
    const step = getCurrentStep(vmGraph, vmState)
    if (step?.type === 'goto') {
      const jumped = executeGotoStep(vmGraph, vmState, step)
      if (jumped.ok) {
        setVmState(jumped.state)
        setUnsupportedNote(null)
      } else if (jumped.ok === false) {
        setUnsupportedNote(jumped.error)
      }
      return
    }
    const result = advanceVm(vmGraph, vmState)
    if (result.ok && !result.finished) {
      setVmState(result.state)
    }
  }, [vmGraph, vmState])

  const jump = useCallback(
    (target: string): void => {
      if (!vmGraph || !vmState) return
      const jumped = jumpToTarget(vmGraph, vmState, target)
      if (jumped.ok) {
        setVmState(jumped.state)
        setSelectedSceneId(jumped.state.sceneId)
        setUnsupportedNote(null)
      } else if (jumped.ok === false) {
        setUnsupportedNote(jumped.error)
      }
    },
    [vmGraph, vmState, setSelectedSceneId]
  )

  const togglePlay = (): void => {
    const rt = runtimeRef.current
    if (!rt) return
    if (runtimeState === 'playing') {
      rt.stopScene()
    } else {
      rt.playScene()
    }
  }

  const handleSave = useCallback(
    async (slot: number): Promise<void> => {
      if (!vmState) return
      const r = await saveSlot(slot, vmState)
      if (r.ok) {
        setSaveNote(`已保存到槽 ${slot}`)
        setTimeout(() => setSaveNote(null), 2000)
      } else {
        setSaveNote(r.error ?? '保存失败')
      }
    },
    [vmState, saveSlot]
  )

  const handleLoad = useCallback(
    async (slot: number): Promise<void> => {
      const r = await loadSlot(slot)
      if (r.ok && r.state) {
        setVmState(r.state)
        setSelectedSceneId(r.state.sceneId)
        setUnsupportedNote(null)
        setSaveNote(`已从槽 ${slot} 加载`)
        setTimeout(() => setSaveNote(null), 2000)
      } else {
        setSaveNote(r.error ?? '加载失败')
      }
    },
    [loadSlot, setSelectedSceneId]
  )

  const renderStepOverlay = (): JSX.Element | null => {
    if (!currentStep) {
      return (
        <div className="absolute bottom-3 left-3 right-3 bg-black/50 backdrop-blur-md p-3 rounded-xl z-10 text-center text-text-muted text-sm">
          场景播放完毕
        </div>
      )
    }

    switch (currentStep.type) {
      case 'dialogue':
        return (
          <motion.div
            key={`${vmState?.stepIndex}-${currentStep.text}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={advance}
            className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md p-3 rounded-xl cursor-pointer z-10"
          >
            <div className="text-accent-soft text-[13px] font-medium mb-1">{currentStep.character}</div>
            <div className="text-white text-sm leading-relaxed">{currentStep.text}</div>
          </motion.div>
        )
      case 'choice':
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-3/4 z-10"
          >
            {currentStep.options.map((opt, i) => (
              <button
                key={`${opt.target}-${i}`}
                onClick={() => opt.target && jump(opt.target)}
                disabled={!opt.target}
                className="px-4 py-2 bg-surface/90 hover:bg-surface text-text text-sm rounded-xl shadow-sm disabled:opacity-40 transition-colors"
              >
                {opt.text}
              </button>
            ))}
          </motion.div>
        )
      case 'marker':
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={advance}
            className="absolute bottom-3 left-3 right-3 bg-amber-900/60 backdrop-blur-md p-3 rounded-xl cursor-pointer z-10 border border-amber-500/30"
          >
            <div className="text-amber-200 text-[11px] font-mono uppercase tracking-wide mb-1">
              标记点
            </div>
            <div className="text-white text-sm font-mono">{currentStep.id}</div>
            <div className="text-amber-200/70 text-[11px] mt-1">点击继续</div>
          </motion.div>
        )
      case 'goto':
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={advance}
            className="absolute bottom-3 left-3 right-3 bg-violet-900/60 backdrop-blur-md p-3 rounded-xl cursor-pointer z-10 border border-violet-500/30"
          >
            <div className="text-violet-200 text-[11px] font-mono uppercase tracking-wide mb-1">
              跳转
            </div>
            <div className="text-white text-sm font-mono">→ {currentStep.target}</div>
            <div className="text-violet-200/70 text-[11px] mt-1">点击执行跳转</div>
          </motion.div>
        )
      default:
        return null
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      <PanelHeader
        title="预览"
        icon={Play}
        size="lg"
        actions={
          sceneId ? (
            <span className="text-[12px] font-mono text-text-muted">{sceneId}</span>
          ) : null
        }
      />
      {projectParseError ? (
        <ProjectParseErrorBanner error={projectParseError} testId="preview-parse-error-banner" />
      ) : null}
      {sceneEmpty ? (
        <div
          className="flex-1 flex flex-col items-center justify-center bg-canvas gap-3 text-text-muted"
          data-testid="preview-empty"
        >
          <Box className="w-16 h-16 opacity-20" />
          <div className="text-sm font-medium text-text">暂无场景</div>
          <div className="text-xs text-text-muted">在编辑器中写 [scene ...] 块</div>
          <div className="text-[11px] text-text-muted opacity-70 mt-1">
            或按{' '}
            <kbd className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-[10px] font-mono">
              ⌘N
            </kbd>{' '}
            新建脚本文件
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative w-full max-w-[640px] aspect-video rounded-xl overflow-hidden shadow-md bg-gradient-to-br from-bg-elevated to-bg border border-border">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              data-testid="preview-canvas"
            />
            <div className="absolute top-3 left-3 px-2 py-0.5 bg-surface/80 backdrop-blur rounded-md text-[11px] font-mono text-text-muted z-10 border border-border">
              {sceneId ?? '—'}
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
              <div className="flex items-center gap-0.5 mr-1">
                {Array.from({ length: PREVIEW_SAVE_SLOT_COUNT }, (_, i) => i + 1).map((slot) => (
                  <div key={slot} className="flex items-center">
                    <button
                      onClick={() => void handleSave(slot)}
                      className="p-1 bg-surface/80 backdrop-blur rounded-l-md hover:bg-surface text-text-muted hover:text-text border border-border border-r-0"
                      title={`保存到槽 ${slot}`}
                      data-testid={`preview-save-${slot}`}
                    >
                      <Save className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => void handleLoad(slot)}
                      className="p-1 bg-surface/80 backdrop-blur rounded-r-md hover:bg-surface text-text-muted hover:text-text border border-border mr-0.5"
                      title={`从槽 ${slot} 加载`}
                      data-testid={`preview-load-${slot}`}
                    >
                      <FolderOpen className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setMuted((m) => !m)}
                className="p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border"
                title={muted ? '取消静音' : '静音 BGM'}
                data-testid="preview-mute"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-16 h-1 accent-accent"
                title="BGM 音量"
                data-testid="preview-volume"
              />
              <button
                onClick={togglePlay}
                className="p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border"
                title="播放/停止"
                data-testid="preview-toggle"
              >
                {runtimeState === 'playing' ? (
                  <Square className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </button>
            </div>
            {saveNote && (
              <div className="absolute top-12 right-3 px-2 py-1 bg-emerald-900/70 text-emerald-100 text-[11px] rounded z-10">
                {saveNote}
              </div>
            )}
            {unsupportedNote && (
              <div className="absolute top-12 left-3 right-3 px-2 py-1 bg-red-900/70 text-red-100 text-[11px] rounded z-10">
                {unsupportedNote}
              </div>
            )}
            {renderStepOverlay()}
          </div>
        </div>
      )}
    </div>
  )
}
