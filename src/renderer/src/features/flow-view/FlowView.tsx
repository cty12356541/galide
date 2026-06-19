import { useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { parse } from '../../../../shared/dsl/parser'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type {
  AstNode,
  ChoiceNode,
  DialogueNode,
  GotoNode,
  SceneNode,
  ScriptNode
} from '../../../../shared/dsl/types'
import { FlowNode, type SceneFlowNode } from './FlowNode'

// 读 CSS 变量(避免内联 style 写死颜色 token,light/dark 自动切换)
const cssVar = (name: string): string => {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}


const buildFlow = (ast: ScriptNode): { nodes: SceneFlowNode[]; edges: Edge[] } => {
  const scenes = collectNodes(ast, (n): n is SceneNode => n.type === 'scene')
  const sceneIds = new Set(scenes.map((s) => s.id))
  const nodes: SceneFlowNode[] = []
  const edges: Edge[] = []
  const xSpacing = 260
  const ySpacing = 180

  // 找节点所属 scene:scene 内节点查 s.children;root 平铺层节点取前序 scene
  // (root.children 中该节点之前最近的 scene),跨场景 goto/choice 的视觉源
  const findSourceScene = (node: AstNode): SceneNode | undefined => {
    const inScene = scenes.find((s) => s.children.includes(node))
    if (inScene) return inScene
    // root 平铺层:线性找前序 scene
    const idx = ast.children.indexOf(node)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = ast.children[i]
      if (prev.type === 'scene') return prev
    }
    return undefined
  }
  scenes.forEach((scene, i) => {
    const dialogueCount = collectNodes(scene, (n): n is DialogueNode => n.type === 'dialogue')
      .length
    nodes.push({
      id: scene.id,
      type: 'scene',
      position: { x: (i % 3) * xSpacing, y: Math.floor(i / 3) * ySpacing },
      data: { label: scene.id, dialogueCount }
    })
  })
  const choices = collectNodes(ast, (n): n is ChoiceNode => n.type === 'choice')
  for (const choice of choices) {
    const sourceScene = findSourceScene(choice)
    if (!sourceScene) continue
    for (const opt of choice.options) {
      if (opt.target && sceneIds.has(opt.target)) {
        edges.push({
          id: `${sourceScene.id}-${opt.target}-${opt.text}`,
          source: sourceScene.id,
          target: opt.target,
          label: opt.text,
          style: { stroke: cssVar('--flow-edge'), strokeWidth: 1.5 },
          labelStyle: { fill: cssVar('--text-muted'), fontSize: 11 },
          labelBgStyle: { fill: cssVar('--surface') }
        })
      }
    }
  }
  const gotos = collectNodes(ast, (n): n is GotoNode => n.type === 'goto')
  for (const goto of gotos) {
    if (!sceneIds.has(goto.target)) continue
    const sourceScene = findSourceScene(goto)
    if (!sourceScene) continue
    edges.push({
      id: `${sourceScene.id}-${goto.target}-goto`,
      source: sourceScene.id,
      target: goto.target,
      style: { stroke: cssVar('--flow-edge-dashed'), strokeWidth: 1, strokeDasharray: '4 4' }
    })
  }
  return { nodes, edges }
}

export const FlowView = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const script = useScript()
  const [source, setSource] = useState<string>('')
  const setSelectedNode = useUiStore((s) => s.setSelectedNode)

  useEffect(() => {
    if (!projectPath || !activeScript) return
    void script.read(projectPath, activeScript).then((text) => {
      if (text) setSource(text)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, activeScript])

  const { nodes, edges } = useMemo<{ nodes: SceneFlowNode[]; edges: Edge[] }>(() => {
    const result = parse(source)
    if (result.ok) return buildFlow(result.value)
    return { nodes: [], edges: [] }
  }, [source])

  return (
    <div className="h-full flex flex-col bg-bg">
      <PanelHeader
        title="分支预览"
        icon={GitBranch}
        size="lg"
        actions={<span className="text-[11px] text-text-muted">{nodes.length} 节点 · {edges.length} 边</span>}
      />
    <div className="flex-1">
        {nodes.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <GitBranch className="w-8 h-8 mx-auto mb-3 text-text-muted opacity-30" />
              <p className="text-sm text-text-muted">剧本无场景</p>
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={{ scene: FlowNode }}
            fitView
            onNodeClick={(_e, node) => {
              setSelectedNode({
                type: 'scene',
                id: node.id,
                line: 0,
                column: 0,
                children: []
              })
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={cssVar('--flow-bg-dot')} gap={16} />
            <Controls className="!bg-surface !border-border !shadow-sm" />
            <MiniMap
              maskColor={cssVar('--flow-minimap-mask')}
              style={{ background: cssVar('--flow-minimap-bg'), border: `1px solid ${cssVar('--border')}`, borderRadius: 12 }}
              nodeColor={cssVar('--accent')}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
