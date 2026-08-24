/**
 * PreviewBacklogPanel — 对白回看日志(本次播放会话)
 */
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { VmBacklogEntry } from '../../../../shared/preview/runtime-vm'

interface PreviewBacklogPanelProps {
  entries: readonly VmBacklogEntry[]
  onClose: () => void
}

export const PreviewBacklogPanel = ({ entries, onClose }: PreviewBacklogPanelProps): JSX.Element => {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [entries.length])

  return (
    <div
      className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex flex-col p-3"
      data-testid="preview-backlog"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-white/80 text-xs font-medium tracking-wide">回看日志({entries.length})</div>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white"
          title="关闭回看"
          data-testid="preview-backlog-close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div ref={listRef} className="flex-1 min-h-0 overflow-auto space-y-2 pr-1">
        {entries.length === 0 ? (
          <div className="text-white/50 text-xs text-center py-8">还没有播放过的对白</div>
        ) : (
          entries.map((e, i) => (
            <div
              key={`${e.sceneId}-${i}`}
              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10"
              data-testid="preview-backlog-entry"
            >
              <div className="text-accent-soft text-[11px] font-medium">
                {e.character}
                <span className="text-white/30 font-mono ml-2">{e.sceneId}</span>
              </div>
              <div className="text-white/90 text-sm leading-relaxed mt-0.5">{e.text}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
