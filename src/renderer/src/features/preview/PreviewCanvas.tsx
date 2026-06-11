import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { parse } from '../../../../shared/dsl/parser'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { ChoiceNode, DialogueNode, SceneNode, ScriptNode } from '../../../../shared/dsl/types'
import { motion } from 'framer-motion'

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

export const PreviewCanvas = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const script = useScript()
  const [items, setItems] = useState<PreviewItem[]>([])
  const [sceneId, setSceneId] = useState<string | null>(null)
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (!projectPath || !activeScript) return
    void script.read(projectPath, activeScript).then((text) => {
      if (!text) return
      const result = parse(text)
      if (!result.ok) return
      const first = collectScenes(result.value)[0]
      if (first) {
        setSceneId(first.id)
        setItems(buildItems(first))
        setCursor(0)
      }
    })
  }, [projectPath, activeScript])

  const current = items[cursor]
  const next = (): void => setCursor((c) => c + 1)

  const jump = (target: string): void => {
    if (!projectPath || !activeScript) return
    void script.read(projectPath, activeScript).then((text) => {
      if (!text) return
      const result = parse(text)
      if (!result.ok) return
      const targetScene = collectScenes(result.value).find((s) => s.id === target)
      if (targetScene) {
        setSceneId(target)
        setItems(buildItems(targetScene))
        setCursor(0)
      }
    })
  }

  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="h-10 bg-surface border-b border-border flex items-center px-3">
        <Play className="w-4 h-4 mr-2 text-text-muted" />
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">预览</span>
        {sceneId && <span className="ml-auto text-[11px] font-mono text-text-muted">{sceneId}</span>}
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-[640px] aspect-video rounded-2xl overflow-hidden shadow-md bg-gradient-to-br from-accent-soft to-bg-elevated">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-text-muted text-xs">背景占位</div>
          </div>
          <div className="absolute top-3 left-3 px-2 py-0.5 bg-surface/80 backdrop-blur rounded-md text-[10px] font-mono text-text-muted">
            {sceneId ?? '—'}
          </div>
          {current?.type === 'dialogue' && (
            <motion.div
              key={`${cursor}-${current.text}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={next}
              className="absolute bottom-3 left-3 right-3 bg-black/60 backdrop-blur-md p-3 rounded-xl cursor-pointer"
            >
              <div className="text-accent-soft text-xs font-medium mb-1">{current.character}</div>
              <div className="text-white text-sm leading-relaxed">{current.text}</div>
            </motion.div>
          )}
          {current?.type === 'choice' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-3/4"
            >
              {current.options.map((opt, i) => (
                <button
                  key={i}
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
    </div>
  )
}
