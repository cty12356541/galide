import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Square, Box } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { parse } from '../../../../shared/dsl/parser'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { ChoiceNode, DialogueNode, SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import type { PreviewState } from './PreviewRuntime'
import { motion } from 'framer-motion'
import { createPreviewRuntime, type PreviewRuntime } from './PreviewRuntime'

type PreviewDialogue = { type: 'dialogue'; character: string; text: string }
type PreviewChoice = { type: 'choice'; options: { text: string; target: string }[] }
type PreviewItem = PreviewDialogue | PreviewChoice

const buildItems = (scene: SceneNode): PreviewItem[] => {
  const items: PreviewItem[] = []
  const dialogues = collectNodes(scene, (n): n is DialogueNode => n.type === 'dialogue')
  for (const d of dialogues) {
    for (const line of d.lines) {
      items.push({ type: 'dialogue', character: d.character, text: line })
    }
  }
  const choices = collectNodes(scene, (n): n is ChoiceNode => n.type === 'choice')
  for (const c of choices) {
    items.push({ type: 'choice', options: c.options })
  }
  return items
}

const collectScenes = (ast: ScriptNode): SceneNode[] =>
  collectNodes(ast, (n): n is SceneNode => n.type === 'scene')

/**
 * P0-5 修复:
 * 1. 重复的 updateScene(target) 合并为一次
 * 2. sceneRef 死代码删除
 * 3. togglePlay 改用 subscribeState 把状态同步到 React,
 *    原版 runtimeRef.current.getState() 在 render 中读,变化不触发重渲染 → 图标永远显示 Play
 */
export const PreviewCanvas = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const script = useScript()
  const [items, setItems] = useState<PreviewItem[]>([])
  const [sceneId, setSceneId] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [runtimeState, setRuntimeState] = useState<PreviewState>('idle')
  const [sceneEmpty, setSceneEmpty] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<PreviewRuntime | null>(null)
  const loadSeqRef = useRef(0)

  // mount-only: 创建 PixiJS runtime(空场景时不挂,避免黑块)
  useEffect(() => {
    if (sceneEmpty) return
    if (!canvasRef.current) return
    const runtime = createPreviewRuntime()
    runtimeRef.current = runtime
    void runtime.mount(canvasRef.current)
    const off = runtime.subscribeState(setRuntimeState)
    return () => {
      off()
      runtime.unmount()
      runtimeRef.current = null
    }
  }, [sceneEmpty])

  const loadScene = useCallback(
    (targetId?: string): void => {
      if (!projectPath || !activeScript) return
      const seq = ++loadSeqRef.current
      void script.read(projectPath, activeScript).then(async (text) => {
        if (seq !== loadSeqRef.current) return
        if (!text) {
          setSceneEmpty(true)
          setItems([])
          setSceneId(null)
          return
        }
        const result = parse(text)
        if (!result.ok) {
          setSceneEmpty(true)
          setItems([])
          setSceneId(null)
          return
        }
        const scenes = collectScenes(result.value)
        if (scenes.length === 0) {
          setSceneEmpty(true)
          setItems([])
          setSceneId(null)
          return
        }
        const target = targetId ? scenes.find((s) => s.id === targetId) : scenes[0]
        if (!target) {
          setSceneEmpty(true)
          setItems([])
          setSceneId(null)
          return
        }
        setSceneEmpty(false)
        setSceneId(target.id)
        setItems(buildItems(target))
        setCursor(0)
        if (runtimeRef.current) {
          await runtimeRef.current.updateScene(target)
        }
      })
    },
    [projectPath, activeScript, script]
  )

  // activeScript 切换时重新加载
  useEffect(() => {
    loadScene()
  }, [loadScene])

  const current = items[cursor]
  const next = (): void => setCursor((c) => c + 1)

  const jump = (target: string): void => {
    loadScene(target)
  }

  const togglePlay = (): void => {
    const rt = runtimeRef.current
    if (!rt) return
    if (runtimeState === 'playing') {
      rt.stopScene()
    } else {
      rt.playScene()
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="h-10 bg-bg-elevated border-b border-border flex items-center px-3 gap-2">
        <Play className="w-4 h-4 text-text-muted" />
        <span className="text-[13px] font-medium text-text-muted uppercase tracking-wider">预览</span>
        {sceneId && (
          <span className="ml-auto text-[12px] font-mono text-text-muted">{sceneId}</span>
        )}
      </div>
      {sceneEmpty ? (
        <div
          className="flex-1 flex flex-col items-center justify-center bg-canvas gap-3 text-text-muted"
          data-testid="preview-empty"
        >
          <Box className="w-16 h-16 opacity-20" />
          <div className="text-sm font-medium text-text">暂无场景</div>
          <div className="text-xs text-text-muted">在编辑器中写 [scene ...] 块</div>
          <div className="text-[11px] text-text-muted opacity-70 mt-1">
            或按 <kbd className="px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-[10px] font-mono">⌘N</kbd> 新建场景
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
            <button
              onClick={togglePlay}
              className="absolute top-3 right-3 p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text z-10 border border-border"
              title="播放/停止"
              data-testid="preview-toggle"
            >
              {runtimeState === 'playing' ? (
                <Square className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            {current?.type === 'dialogue' && (
              <motion.div
                key={`${cursor}-${current.text}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={next}
                className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md p-3 rounded-xl cursor-pointer z-10"
              >
                <div className="text-accent-soft text-[13px] font-medium mb-1">{current.character}</div>
                <div className="text-white text-sm leading-relaxed">{current.text}</div>
              </motion.div>
            )}
            {current?.type === 'choice' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-3/4 z-10"
              >
                {current.options.map((opt, i) => (
                  <button
                    key={`${opt.target}-${i}`}
                    onClick={() => opt.target && jump(opt.target)}
                    disabled={!opt.target}
                    className="px-4 py-2 bg-white/90 hover:bg-white text-text text-sm rounded-xl shadow-sm disabled:opacity-40 transition-colors"
                  >
                    {opt.text}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
