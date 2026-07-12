import { Play, Square, Volume2, VolumeX, Undo2, Pause } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import type { PreviewState } from './PreviewRuntime'

interface PreviewPlaybackBarProps {
  muted: boolean
  setMuted: Dispatch<SetStateAction<boolean>>
  volume: number
  setVolume: Dispatch<SetStateAction<number>>
  runtimeState: PreviewState
  onTogglePlay: () => void
  canStepBack: boolean
  onStepBack: () => void
  autoPlay: boolean
  setAutoPlay: (value: boolean) => void
  canAutoPlay: boolean
}

export const PreviewPlaybackBar = ({
  muted,
  setMuted,
  volume,
  setVolume,
  runtimeState,
  onTogglePlay,
  canStepBack,
  onStepBack,
  autoPlay,
  setAutoPlay,
  canAutoPlay
}: PreviewPlaybackBarProps): JSX.Element => (
  <div className="flex items-center gap-1">
    <button
      onClick={onStepBack}
      disabled={!canStepBack}
      className="p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border disabled:opacity-40 disabled:cursor-not-allowed"
      title="步退"
      data-testid="preview-step-back"
    >
      <Undo2 className="w-4 h-4" />
    </button>
    <button
      onClick={() => setAutoPlay(!autoPlay)}
      disabled={!canAutoPlay && !autoPlay}
      className="p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border disabled:opacity-40 disabled:cursor-not-allowed"
      title={autoPlay ? '关闭自动播放' : '自动播放'}
      data-testid="preview-auto-play"
    >
      {autoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
    </button>
    <button
      onClick={() => setMuted(!muted)}
      className="p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border"
      title={muted ? '取消静音' : '静音 BGM'}
      data-testid="preview-mute"
    >
      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
    </button>
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={volume}
      onChange={(e) => setVolume(Number(e.target.value))}
      className="w-16 h-1 accent-accent"
      title="BGM 音量"
      data-testid="preview-volume"
    />
    <button
      onClick={onTogglePlay}
      className="p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border"
      title="播放/停止"
      data-testid="preview-toggle"
    >
      {runtimeState === 'playing' ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
    </button>
  </div>
)
