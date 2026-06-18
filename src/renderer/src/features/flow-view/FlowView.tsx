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
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { parse } from '../../../../shared/dsl/parser'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type {
  ChoiceNode,
  DialogueNode,
  GotoNode,
  SceneNode,
  ScriptNode
} from '../../../../shared/dsl/types'
import { FlowNode, type SceneFlowNode } from './FlowNode'

const buildFlow = (ast: ScriptNode): { nodes: SceneFlowNode[]; edges: Edge[] } => {
  const scenes = collectNodes(ast, (n): n is SceneNode => n.type === 'scene')
  const sceneIds = new Set(scenes.map((s) => s.id))
  const nodes: SceneFlowNode[] = []
  const edges: Edge[] = []
  const xSpacing = 260
  const ySpacing = 180
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
    const sourceScene = scenes.find((s) => s.children.includes(choice))
    if (!sourceScene) continue
    for (const opt of choice.options) {
      if (opt.target && sceneIds.has(opt.target)) {
        edges.push({
          id: `${sourceScene.id}-${opt.target}-${opt.text}`,
          source: sourceScene.id,
          target: opt.target,
          label: opt.text,
          style: { stroke: '#7c3aed', strokeWidth: 1.5 },
          labelStyle: { fill: '#78716c', fontSize: 11 },
          labelBgStyle: { fill: '#fafaf9' }
        })
      }
    }
  }
  const gotos = collectNodes(ast, (n): n is GotoNode => n.type === 'goto')
  for (const goto of gotos) {
    if (!sceneIds.has(goto.target)) continue
    const sourceScene = scenes.find((s) => s.children.includes(goto))
    if (!sourceScene) continue
    edges.push({
      id: `${sourceScene.id}-${goto.target}-goto`,
      source: sourceScene.id,
      target: goto.target,
      style: { stroke: '#a8a29e', strokeWidth: 1, strokeDasharray: '4 4' }
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
      <div className="h-10 bg-surface border-b border-border flex items-center px-3">
        <GitBranch className="w-4 h-4 mr-2 text-text-muted" />
        <span className="text-xs font-medium text-text-muted uppercase tracking-wider">分支预览</span>
        <span className="ml-auto text-[11px] text-text-muted">{nodes.length} 节点 · {edges.length} 边</span>
      </div>
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
            <Background color="#e7e5e4" gap={16} />
            <Controls className="!bg-surface !border-border !shadow-sm" />
            <MiniMap
              maskColor="rgba(250, 250, 249, 0.7)"
              style={{ background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12 }}
              nodeColor="#a78bfa"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
