import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Box } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { useUiStore, useErrorStore } from '../../lib/store'
import { useShallow } from 'zustand/react/shallow'
import { useAsset } from '../../lib/ipc/use-asset'
import type { SceneNode } from '../../../../shared/dsl/types'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'
import {
  advanceVm,
  buildVmGraph,
  buildBacklog,
  createVmState,
  dialogueLineId,
  executeGotoStep,
  getCurrentStep,
  getCurrentScene,
  isRead,
  jumpToTarget,
  markRead,
  stepBack,
  type VmGraph,
  type VmState,
  type VmReadState
} from '../../../../shared/preview/runtime-vm'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { PreviewState } from './PreviewRuntime'
import { motion } from 'framer-motion'
import type { PreviewRuntime } from './PreviewRuntime'
import { usePreviewAudio } from './usePreviewAudio'
import { SpriteLayer } from './SpriteLayer'
import { usePreviewSave, type PreviewSlotInfo } from '../../lib/ipc/use-preview-save'
import { usePreviewRead } from '../../lib/ipc/use-preview-read'
import { acceleratorLabel, effectiveShortcut } from '../../lib/command-registry'
import { ProjectParseErrorBanner } from '../../components/ui/project-parse-error-banner'
import { usePreference } from '../../lib/ipc/use-preferences'
import { useVoice } from '../../lib/ipc/use-voice'
import { usePreviewRuntime } from './use-preview-runtime'
import { usePreviewAutoPlay, AUTO_PLAY_SPEED_LABELS } from './usePreviewAutoPlay'
import { usePreviewSkipRead } from './usePreviewSkipRead'
import { PreviewBacklogPanel } from './PreviewBacklogPanel'
import { PreviewSlotBar } from './PreviewSlotBar'
import { PreviewPlaybackBar } from './PreviewPlaybackBar'

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
  const { scriptAst, projectMergedAst, projectParseError, manifest, selectedSceneId, projectPath, resolvedShortcuts } = useUiStore(
    useShallow((s) => ({
      scriptAst: s.scriptAst,
      projectMergedAst: s.projectMergedAst,
      projectParseError: s.projectParseError,
      manifest: s.manifest,
      selectedSceneId: s.selectedSceneId,
      projectPath: s.projectPath,
      resolvedShortcuts: s.resolvedShortcuts,
    }))
  )
  const viewAst = projectMergedAst ?? scriptAst
  // 空场景提示的 ⌘N 展示标签:与菜单/工具条同一消费模式(注册表派生,不硬编码字形)
  const newScriptFileHint = acceleratorLabel(
    resolvedShortcuts['newScriptFile'] ?? effectiveShortcut('newScriptFile', undefined)
  )
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const { resolveAsync } = useAsset()
  const { saveSlot, loadSlot, listSlots } = usePreviewSave(projectPath)
  const voicePrefsQuery = usePreference('voice')
  const voiceApi = useVoice()
  const pushError = useErrorStore((s) => s.push)
  const previewTtsEnabled = (voicePrefsQuery.data as { previewEnabled?: boolean } | null | undefined)?.previewEnabled === true

  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [backlogOpen, setBacklogOpen] = useState(false)
  const [vmState, setVmState] = useState<VmState | null>(null)
  const [runtimeState, setRuntimeState] = useState<PreviewState>('idle')
  const [unsupportedNote, setUnsupportedNote] = useState<string | null>(null)
  const [slots, setSlots] = useState<PreviewSlotInfo[]>([])

  const { audioRef, voiceRef, muted, setMuted, volume, setVolume } = usePreviewAudio()
  const { readState: loadedReadState, saveReadState } = usePreviewRead(projectPath)
  const [readState, setReadStateLocal] = useState<VmReadState>({ readLineIds: [] })
  useEffect(() => {
    setReadStateLocal(loadedReadState)
  }, [loadedReadState])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<PreviewRuntime | null>(null)
  const sceneRef = useRef<SceneNode | null>(null)

  const vmGraph = useMemo<VmGraph | null>(
    () => (viewAst ? buildVmGraph(viewAst) : null),
    [viewAst]
  )

  const scenes = useMemo(
    () => (viewAst ? collectNodes(viewAst, (n): n is SceneNode => n.type === 'scene') : []),
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
    voiceApi: {
      generate: async (projectPath, lineId, text, characterId) => {
        const result = await voiceApi.generate(projectPath, lineId, text, characterId)
        return result ?? { ok: false, error: 'Voice API returned undefined' }
      }
    },
    setRuntimeState,
    onVoiceError: (message) =>
      pushError({ code: 'PREVIEW_TTS_FAILED', message, source: 'preview:tts' })
  })

  useEffect(() => {
    const vmScene = vmGraph && vmState ? getCurrentScene(vmGraph, vmState) : null
    if (!vmScene) return
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
  }, [vmGraph, vmState, projectPath, resolveAsync, audioRef])

  const resolveCharacterId = useCallback(
    (displayName: string): string => {
      const chars = manifest?.characters ?? []
      const hit = chars.find((c) => c.name === displayName || c.id === displayName)
      return hit?.id ?? displayName
    },
    [manifest?.characters]
  )

  useEffect(() => {
    if (!previewTtsEnabled || currentStep?.type !== 'dialogue' || !vmState || !sceneId) return
    const lineId = `${sceneId}-${vmState.stepIndex}`
    const characterId = resolveCharacterId(currentStep.character)
    void voiceRef.current?.playDialogue(lineId, currentStep.text, characterId)
  }, [currentStep, previewTtsEnabled, vmState, sceneId, resolveCharacterId, voiceRef])

  useEffect(() => {
    if (currentStep?.type !== 'set' || !vmGraph || !vmState) return
    const result = advanceVm(vmGraph, vmState)
    if (result.ok) setVmState(result.state)
  }, [currentStep, vmGraph, vmState])

  // 已读标记:对白展示即记为已读并持久化(全局,跨存档槽)
  useEffect(() => {
    if (currentStep?.type !== 'dialogue' || !sceneId) return
    const lineId = dialogueLineId(sceneId, currentStep.character, currentStep.text)
    if (isRead(readState, lineId)) return
    const next = markRead(readState, lineId)
    setReadStateLocal(next)
    void saveReadState(next)
  }, [currentStep, sceneId, readState, saveReadState])

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

  const refreshSlots = useCallback(async (): Promise<void> => {
    const s = await listSlots()
    setSlots(s)
  }, [listSlots])

  const handleSave = useCallback(
    async (slot: number): Promise<void> => {
      if (!vmState) return
      const r = await saveSlot(slot, vmState)
      if (r.ok) {
        setSaveNote(`已保存到槽 ${slot}`)
        await refreshSlots()
        setTimeout(() => setSaveNote(null), 2000)
      } else {
        setSaveNote(r.error ?? '保存失败')
      }
    },
    [vmState, saveSlot, refreshSlots]
  )

  const handleLoad = useCallback(
    async (slot: number): Promise<void> => {
      const r = await loadSlot(slot)
      if (r.ok && r.state) {
        setVmState(r.state)
        setSelectedSceneId(r.state.sceneId)
        setUnsupportedNote(null)
        setSaveNote(`已从槽 ${slot} 加载`)
        await refreshSlots()
        setTimeout(() => setSaveNote(null), 2000)
      } else {
        setSaveNote(r.error ?? '加载失败')
      }
    },
    [loadSlot, setSelectedSceneId, refreshSlots]
  )

  const handleStepBack = useCallback((): void => {
    if (!vmState) return
    const restored = stepBack(vmState)
    if (restored === vmState) return
    setVmState(restored)
    setSelectedSceneId(restored.sceneId)
    setUnsupportedNote(null)
  }, [vmState, setSelectedSceneId])

  useEffect(() => {
    if (!projectPath) return
    void refreshSlots()
  }, [projectPath, refreshSlots])

  const { autoPlay, setAutoPlay, canAutoPlay, speedIndex, cycleSpeed } = usePreviewAutoPlay({
    advance,
    currentStep
  })
  const { skipRead, setSkipRead } = usePreviewSkipRead({
    advance,
    currentStep,
    readState,
    sceneId
  })
  const backlogEntries = useMemo(
    () => (vmGraph && vmState ? buildBacklog(vmGraph, vmState) : []),
    [vmGraph, vmState]
  )
  // 互斥:开启跳过已读时关闭自动播放,反之亦然
  useEffect(() => {
    if (skipRead && autoPlay) setAutoPlay(false)
  }, [skipRead, autoPlay, setAutoPlay])
  useEffect(() => {
    if (autoPlay && skipRead) setSkipRead(false)
  }, [autoPlay, skipRead, setSkipRead])

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
            <div className="text-amber-200 text-[11px] font-mono uppercase tracking-wide mb-1">标记点</div>
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
            <div className="text-violet-200 text-[11px] font-mono uppercase tracking-wide mb-1">跳转</div>
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
        actions={sceneId ? <span className="text-[12px] font-mono text-text-muted">{sceneId}</span> : null}
      />
      {projectParseError ? (
        <ProjectParseErrorBanner error={projectParseError} testId="preview-parse-error-banner" />
      ) : null}
      {sceneEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-canvas gap-3 text-text-muted" data-testid="preview-empty">
          <Box className="w-16 h-16 opacity-20" />
          <div className="text-sm font-medium text-text">暂无场景</div>
          <div className="text-xs text-text-muted">在编辑器中写 [scene ...] 块</div>
          <div className="text-[11px] text-text-muted opacity-70 mt-1">
            或按{' '}
            <kbd className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-[10px] font-mono">{newScriptFileHint}</kbd>{' '}
            新建脚本文件
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="relative w-full max-w-[640px] aspect-video rounded-xl overflow-hidden shadow-md bg-gradient-to-br from-bg-elevated to-bg border border-border">
            <SpriteLayer
              canvasRef={canvasRef}
              runtimeRef={runtimeRef}
              vmGraph={vmGraph}
              vmState={vmState}
              viewAst={viewAst}
              projectPath={projectPath}
              resolveAsync={resolveAsync}
            />
            <div className="absolute top-3 left-3 px-2 py-0.5 bg-surface/80 backdrop-blur rounded-md text-[11px] font-mono text-text-muted z-10 border border-border">
              {sceneId ?? '—'}
            </div>
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              <PreviewSlotBar slots={slots} onSave={handleSave} onLoad={handleLoad} />
              <PreviewPlaybackBar
                muted={muted}
                setMuted={setMuted}
                volume={volume}
                setVolume={setVolume}
                runtimeState={runtimeState}
                onTogglePlay={togglePlay}
                canStepBack={(vmState?.history?.length ?? 0) > 0}
                onStepBack={handleStepBack}
                autoPlay={autoPlay}
                setAutoPlay={setAutoPlay}
                canAutoPlay={canAutoPlay}
                speedLabel={AUTO_PLAY_SPEED_LABELS[speedIndex] ?? '中'}
                onCycleSpeed={cycleSpeed}
                backlogOpen={backlogOpen}
                onToggleBacklog={() => setBacklogOpen((v) => !v)}
                hasBacklog={backlogEntries.length > 0}
                skipRead={skipRead}
                setSkipRead={setSkipRead}
                canSkipRead={backlogEntries.length > 0}
              />
            </div>
            {saveNote && (
              <div className="absolute top-12 right-3 px-2 py-1 bg-emerald-900/70 text-emerald-100 text-[11px] rounded z-10">{saveNote}</div>
            )}
            {unsupportedNote && (
              <div className="absolute top-12 left-3 right-3 px-2 py-1 bg-red-900/70 text-red-100 text-[11px] rounded z-10">{unsupportedNote}</div>
            )}
            {renderStepOverlay()}
            {backlogOpen ? (
              <PreviewBacklogPanel entries={backlogEntries} onClose={() => setBacklogOpen(false)} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
