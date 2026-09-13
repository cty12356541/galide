import { Save } from 'lucide-react'
import type { PreviewSlotInfo } from '../../lib/ipc/use-preview-save'
import { formatSaveSlotLabel } from './formatSaveSlotLabel'

interface PreviewSlotBarProps {
  slots: PreviewSlotInfo[]
  onSave: (slot: number) => void
  onLoad: (slot: number) => void
  getSceneName?: (sceneId: string) => string | undefined
}

export const PreviewSlotBar = ({ slots, onSave, onLoad, getSceneName }: PreviewSlotBarProps): JSX.Element => (
  <div className="flex items-center gap-1">
    {slots.map((slot) => {
      const label = formatSaveSlotLabel(
        slot.slot,
        slot.occupied,
        slot.sceneId,
        slot.timestamp,
        slot.sceneId ? getSceneName?.(slot.sceneId) : undefined
      )
      return (
        <div key={slot.slot} className="flex items-center" title={label}>
          <button
            onClick={() => onSave(slot.slot)}
            className="p-1 bg-surface/80 backdrop-blur rounded-l-md hover:bg-surface text-text-muted hover:text-text border border-border border-r-0"
            data-testid={`preview-save-${slot.slot}`}
          >
            <Save className="w-3 h-3" />
          </button>
          <button
            onClick={() => onLoad(slot.slot)}
            className="px-1.5 py-1 bg-surface/80 backdrop-blur rounded-r-md hover:bg-surface text-text-muted hover:text-text border border-border text-[10px] font-mono max-w-[120px] truncate"
            data-testid={`preview-load-${slot.slot}`}
          >
            {label}
          </button>
        </div>
      )
    })}
  </div>
)
