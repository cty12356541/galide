import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { MapPin, MessageSquare } from 'lucide-react'

export type SceneFlowData = {
  label: string
  dialogueCount: number
}

export type SceneFlowNode = Node<SceneFlowData, 'scene'>

export const FlowNode = ({ data }: NodeProps<SceneFlowNode>): JSX.Element => {
  return (
    <div className="bg-surface border border-border rounded-xl shadow-sm px-3 py-2 min-w-[180px] hover:border-accent hover:shadow-md transition-all">
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
