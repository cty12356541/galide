/**
 * usePreviewSkipRead 单测 — 快进/停止条件
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePreviewSkipRead, currentLineIsRead } from './usePreviewSkipRead'
import { dialogueLineId, markRead } from '../../../../shared/preview/runtime-vm'

const dialogue = { type: 'dialogue', character: '小雪', text: '你好' } as never
const choice = { type: 'choice', options: [] } as never

describe('currentLineIsRead', () => {
  it('对话按 lineId 判定已读/未读', () => {
    const id = dialogueLineId('s1', '小雪', '你好')
    const read = markRead({ readLineIds: [] }, id)
    expect(currentLineIsRead(dialogue, read, 's1')).toBe(true)
    expect(currentLineIsRead(dialogue, { readLineIds: [] }, 's1')).toBe(false)
  })
  it('非对话步返回 null', () => {
    expect(currentLineIsRead(choice, { readLineIds: [] }, 's1')).toBeNull()
  })
})

describe('usePreviewSkipRead', () => {
  it('开启后按间隔 advance;遇到未读对白自动关闭', () => {
    vi.useFakeTimers()
    const advance = vi.fn()
    const { result } = renderHook(() =>
      usePreviewSkipRead({
        advance,
        currentStep: dialogue,
        readState: markRead({ readLineIds: [] }, dialogueLineId('s1', '小雪', '你好')),
        sceneId: 's1'
      })
    )
    act(() => result.current.setSkipRead(true))
    act(() => {
      vi.advanceTimersByTime(450)
    })
    expect(advance.mock.calls.length).toBeGreaterThanOrEqual(3)
    vi.useRealTimers()
  })

  it('当前是选项 → 开启即自动关闭不推进', () => {
    const advance = vi.fn()
    const { result } = renderHook(() =>
      usePreviewSkipRead({ advance, currentStep: choice, readState: { readLineIds: [] }, sceneId: 's1' })
    )
    act(() => result.current.setSkipRead(true))
    expect(result.current.skipRead).toBe(false)
    expect(advance).not.toHaveBeenCalled()
  })
})
