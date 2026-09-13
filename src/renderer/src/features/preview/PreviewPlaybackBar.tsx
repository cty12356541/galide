import { Play, Square, Volume2, VolumeX, Undo2, Pause, ScrollText, FastForward } from 'lucide-react'
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
  speedLabel: string
  onCycleSpeed: () => void
  backlogOpen: boolean
  onToggleBacklog: () => void
  hasBacklog: boolean
  skipRead: boolean
  setSkipRead: (value: boolean) => void
  canSkipRead: boolean
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
  canAutoPlay,
  speedLabel,
  onCycleSpeed,
  backlogOpen,
  onToggleBacklog,
  hasBacklog,
  skipRead,
  setSkipRead,
  canSkipRead
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
    {autoPlay ? (
      <button
        onClick={onCycleSpeed}
        className="px-1.5 h-7 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border text-[11px]"
        title="切换自动播放速度"
        data-testid="preview-auto-speed"
      >
        {speedLabel}
      </button>
    ) : null}
    <button
      onClick={() => setSkipRead(!skipRead)}
      disabled={!canSkipRead && !skipRead}
      className={
        skipRead
          ? 'p-1.5 bg-accent/80 backdrop-blur rounded-md text-white border border-accent'
          : 'p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border disabled:opacity-40 disabled:cursor-not-allowed'
      }
      title={skipRead ? '停止跳过已读' : '跳过已读(快进至未读)'}
      data-testid="preview-skip-read"
    >
      <FastForward className="w-4 h-4" />
    </button>
    <button
      onClick={onToggleBacklog}
      disabled={!hasBacklog && !backlogOpen}
      className={
        backlogOpen
          ? 'p-1.5 bg-accent/80 backdrop-blur rounded-md text-white border border-accent'
          : 'p-1.5 bg-surface/80 backdrop-blur rounded-md hover:bg-surface text-text-muted hover:text-text border border-border disabled:opacity-40 disabled:cursor-not-allowed'
      }
      title="回看日志"
      data-testid="preview-backlog-toggle"
    >
      <ScrollText className="w-4 h-4" />
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
