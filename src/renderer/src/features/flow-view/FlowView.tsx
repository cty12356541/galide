import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { GitBranch, AppWindow } from 'lucide-react'
import { PanelHeader } from '../../components/ui/panel-header'
import { Button } from '../../components/ui/button'
import { useUiStore } from '../../lib/store'
import { usePanelFloat } from '../../lib/hooks/use-panel-float'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type {
  AstNode,
  ChoiceNode,
  DialogueNode,
  GotoNode,
  MarkerNode,
  SceneNode,
  ScriptNode
} from '../../../../shared/dsl/types'
import { serializeExpression } from '../../../../shared/dsl/expression'
import { FlowNode, FlowMarkerNode, type SceneFlowNode, type MarkerFlowNode } from './FlowNode'

// 读 CSS 变量(避免内联 style 写死颜色 token,light/dark 自动切换)
const cssVar = (name: string): string => {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

type FlowResult = { nodes: Node[]; edges: Edge[] }

const buildFlow = (ast: ScriptNode): FlowResult => {
  const scenes = collectNodes(ast, (n): n is SceneNode => n.type === 'scene')
  const sceneIds = new Set(scenes.map((s) => s.id))
  const nodes: Node[] = []
  const edges: Edge[] = []
  const xSpacing = 280
  const ySpacing = 200

  // 场景节点位置(网格),并记录供 marker 偏移定位
  const scenePos = new Map<string, { x: number; y: number }>()
  scenes.forEach((scene, i) => {
    const pos = { x: (i % 3) * xSpacing, y: Math.floor(i / 3) * ySpacing }
    scenePos.set(scene.id, pos)
    const dialogueCount = collectNodes(scene, (n): n is DialogueNode => n.type === 'dialogue').length
    nodes.push({
      id: scene.id,
      type: 'scene',
      position: pos,
      data: { label: scene.id, dialogueCount }
    } as SceneFlowNode)
  })

  // marker 节点:挂在其所属场景右下,作为跳转锚点可视化
  const findSourceScene = (node: AstNode): SceneNode | undefined => {
    const inScene = scenes.find((s) => s.children.includes(node))
    if (inScene) return inScene
    const idx = ast.children.indexOf(node)
    for (let i = idx - 1; i >= 0; i--) {
      const prev = ast.children[i]
      if (prev.type === 'scene') return prev
    }
    return undefined
  }
  const markers = collectNodes(ast, (n): n is MarkerNode => n.type === 'marker')
  markers.forEach((m, i) => {
    const parent = findSourceScene(m)
    const base = parent ? scenePos.get(parent.id) : { x: 0, y: 0 }
    nodes.push({
      id: `marker:${m.id}`,
      type: 'marker',
      position: { x: (base?.x ?? 0) + 190, y: (base?.y ?? 0) + 60 + i * 40 },
      data: { label: m.id }
    } as MarkerFlowNode)
  })

  // 决策边:每个 choice 选项 → 目标场景(带选项文本标签)
  const choices = collectNodes(ast, (n): n is ChoiceNode => n.type === 'choice')
  for (const choice of choices) {
    const sourceScene = findSourceScene(choice)
    if (!sourceScene) continue
    for (const opt of choice.options) {
      if (opt.target && sceneIds.has(opt.target)) {
        const hasCondition = opt.condition !== undefined
        const condLabel = hasCondition ? serializeExpression(opt.condition!) : ''
        edges.push({
          id: `${sourceScene.id}-${opt.target}-${opt.text}`,
          source: sourceScene.id,
          target: opt.target,
          label: hasCondition ? `${opt.text} ⟦${condLabel}⟧` : opt.text,
          style: {
            stroke: hasCondition ? cssVar('--accent') : cssVar('--flow-edge'),
            strokeWidth: hasCondition ? 2 : 1.5,
            ...(hasCondition ? { strokeDasharray: '6 3' } : {})
          },
          labelStyle: {
            fill: hasCondition ? cssVar('--accent') : cssVar('--text-muted'),
            fontSize: 11
          },
          labelBgStyle: { fill: cssVar('--surface') }
        })
      }
    }
  }
  // 跳转边:goto → 目标场景(虚线)
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
  const scriptAst = useUiStore((s) => s.scriptAst)
  const projectMergedAst = useUiStore((s) => s.projectMergedAst)
  const viewAst = projectMergedAst ?? scriptAst
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const setSelectedNode = useUiStore((s) => s.setSelectedNode)
  const float = usePanelFloat()

  const { nodes, edges } = useMemo<FlowResult>(() => {
    if (!viewAst) return { nodes: [], edges: [] }
    return buildFlow(viewAst)
  }, [viewAst])

  // 选中态:同步到 ReactFlow node selected
  const styledNodes = useMemo(
    () => nodes.map((n) => (n.id === selectedSceneId ? { ...n, selected: true } : { ...n, selected: false })),
    [nodes, selectedSceneId]
  )

  return (
    <div className="h-full flex flex-col bg-bg" data-testid="flow-view">
      <PanelHeader
        title="剧情决策树"
        icon={GitBranch}
        size="lg"
        actions={
          <>
            <span className="text-[11px] text-text-muted">
              {nodes.length} 节点 · {edges.length} 边
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => float('flow-view')}
              title="浮出"
              aria-label="浮出"
              data-testid="flow-float"
            >
              <AppWindow className="w-3.5 h-3.5" />
            </Button>
          </>
        }
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
            nodes={styledNodes}
            edges={edges}
            nodeTypes={{ scene: FlowNode, marker: FlowMarkerNode }}
            fitView
            onNodeClick={(_e, node) => {
              if (node.type === 'scene') {
                setSelectedSceneId(node.id)
                setSelectedNode({ type: 'scene', id: node.id, line: 0, column: 0, children: [] })
              }
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color={cssVar('--flow-bg-dot')} gap={16} />
            <Controls className="!bg-surface !border-border !shadow-sm" />
            <MiniMap
              maskColor={cssVar('--flow-minimap-mask')}
              style={{
                background: cssVar('--flow-minimap-bg'),
                border: `1px solid ${cssVar('--border')}`,
                borderRadius: 12
              }}
              nodeColor={cssVar('--accent')}
            />
          </ReactFlow>
        )}
      </div>
    </div>
  )
}
