import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePreviewAutoPlay, AUTO_PLAY_INTERVAL_MS } from './usePreviewAutoPlay'
import type { PlaybackStep } from '../../../../shared/preview/playback-timeline'

describe('usePreviewAutoPlay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const render = (currentStep: PlaybackStep | null) => {
    const advance = vi.fn()
    const { result, unmount } = renderHook(() => usePreviewAutoPlay({ advance, currentStep }))
    return { advance, result, unmount }
  }

  it('starts with autoPlay disabled', () => {
    const { result } = render({ type: 'dialogue', character: 'A', text: 'hi' })
    expect(result.current.autoPlay).toBe(false)
    expect(result.current.canAutoPlay).toBe(true)
  })

  it('calls advance on interval when enabled for dialogue steps', () => {
    const { advance, result } = render({ type: 'dialogue', character: 'A', text: 'hi' })
    act(() => result.current.setAutoPlay(true))
    expect(advance).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS))
    expect(advance).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS))
    expect(advance).toHaveBeenCalledTimes(2)
  })

  it('does not schedule advance when disabled', () => {
    const { advance, result } = render({ type: 'dialogue', character: 'A', text: 'hi' })
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS * 2))
    expect(advance).not.toHaveBeenCalled()
    expect(result.current.autoPlay).toBe(false)
  })

  it('pauses when the current step becomes a choice', () => {
    const advance = vi.fn()
    const { result, rerender } = renderHook(
      ({ step }: { step: PlaybackStep }) => usePreviewAutoPlay({ advance, currentStep: step }),
      { initialProps: { step: { type: 'dialogue', character: 'A', text: 'hi' } } }
    )
    act(() => result.current.setAutoPlay(true))
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS))
    expect(advance).toHaveBeenCalledTimes(1)
    rerender({ step: { type: 'choice', options: [] } })
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS * 2))
    expect(advance).toHaveBeenCalledTimes(1)
  })

  it('cleans up the interval on unmount', () => {
    const { advance, result, unmount } = render({ type: 'dialogue', character: 'A', text: 'hi' })
    act(() => result.current.setAutoPlay(true))
    unmount()
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS * 2))
    expect(advance).toHaveBeenCalledTimes(0)
  })
})
