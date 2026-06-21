import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { MapPin, MessageSquare, Anchor } from 'lucide-react'
import { cn } from '../../lib/utils'

export type SceneFlowData = {
  label: string
  dialogueCount: number
}

export type SceneFlowNode = Node<SceneFlowData, 'scene'>

export type MarkerFlowData = {
  label: string
}

export type MarkerFlowNode = Node<MarkerFlowData, 'marker'>

export const FlowNode = ({ data, selected }: NodeProps<SceneFlowNode>): JSX.Element => {
  return (
    <div
      className={cn(
        'bg-surface border rounded-xl shadow-sm px-3 py-2 min-w-[180px] transition-all',
        selected ? 'border-accent ring-2 ring-accent/40 shadow-md' : 'border-border hover:border-accent hover:shadow-md'
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2 !border-2 !border-surface" />
      <div className="flex items-center gap-2 mb-1">
        <div className="w-5 h-5 rounded-md bg-accent-soft flex items-center justify-center">
          <MapPin className="w-3 h-3 text-accent" />
        </div>
        <span className="text-xs font-medium text-text">{data.label}</span>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-text-muted">
        <MessageSquare className="w-2.5 h-2.5" />
        {data.dialogueCount} 段对白
      </div>
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2 !border-2 !border-surface" />
    </div>
  )
}

export const FlowMarkerNode = ({ data, selected }: NodeProps<MarkerFlowNode>): JSX.Element => (
  <div
    className={cn(
      'bg-bg-elevated border border-dashed rounded-lg px-2 py-1 min-w-[120px] transition-all',
      selected ? 'border-accent ring-2 ring-accent/40' : 'border-border'
    )}
  >
    <Handle type="target" position={Position.Left} className="!w-1.5 !h-1.5" />
    <div className="flex items-center gap-1">
      <Anchor className="w-3 h-3 text-text-muted" />
      <span className="text-[11px] text-text-muted">{data.label}</span>
    </div>
    <Handle type="source" position={Position.Right} className="!w-1.5 !h-1.5" />
  </div>
)
