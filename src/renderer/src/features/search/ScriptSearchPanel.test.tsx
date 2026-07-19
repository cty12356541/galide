/**
 * ScriptSearchPanel — 查找替换交互流测试
 *
 * 覆盖:预览 → 对话框(默认全选/可取消单选)→ 确认 → apply 只回传勾选项
 * → toast 结果 → 搜索结果刷新;零匹配空态;uncheck 后确认数变化。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ScriptSearchPanel } from './ScriptSearchPanel'
import { useUiStore, useErrorStore } from '../../lib/store'
import type { ScriptReplaceMatch } from '../../../../shared/dsl/replace-in-scripts.js'

const toastSpy = vi.fn()
vi.mock('../../components/ui/toast', () => ({
  toast: (...args: unknown[]) => toastSpy(...args)
}))

const MATCH_A: ScriptReplaceMatch = {
  id: 'a.gal:2:6:7',
  file: 'a.gal',
  line: 2,
  column: 1,
  start: 6,
  end: 7,
  matchedText: '艾',
  context: '艾: "我是艾。"',
  tokenKind: 'dialogue'
}

const MATCH_B: ScriptReplaceMatch = {
  id: 'c.gal:1:4:5',
  file: 'c.gal',
  line: 1,
  column: 5,
  start: 4,
  end: 5,
  matchedText: '艾',
  context: '[角色:艾 | 立绘:ai.png | 位置:left]',
  tokenKind: 'plain'
}

type ScriptApiMock = {
  searchProject: ReturnType<typeof vi.fn>
  replacePreview: ReturnType<typeof vi.fn>
  replaceApply: ReturnType<typeof vi.fn>
}

const setGalideMock = (partial: Partial<ScriptApiMock>): ScriptApiMock => {
  const script: ScriptApiMock = {
    searchProject: vi.fn(() => Promise.resolve({ ok: true as const, hits: [] })),
    replacePreview: vi.fn(() => Promise.resolve({ ok: true as const, matches: [], truncated: false })),
    replaceApply: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        applied: 0,
        conflicts: [],
        filesChanged: [],
        snapshotRef: 'ref'
      })
    ),
    ...partial
  }
  const w = window as unknown as { galide: { script: unknown } & Record<string, unknown> }
  w.galide = { ...w.galide, script }
  return script
}

const typeQuery = (text: string): void => {
  fireEvent.change(screen.getByTestId('script-search-input'), { target: { value: text } })
}

describe('ScriptSearchPanel — 替换流', () => {
  beforeEach(() => {
    toastSpy.mockClear()
    useErrorStore.setState({ entries: [] })
    useUiStore.setState({ projectPath: '/p' })
  })

  it('预览 → 对话框默认全选 → 确认后 apply 回传全部匹配并刷新搜索', async () => {
    const api = setGalideMock({
      replacePreview: vi.fn(() =>
        Promise.resolve({ ok: true as const, matches: [MATCH_A, MATCH_B], truncated: false })
      ),
      replaceApply: vi.fn(() =>
        Promise.resolve({
          ok: true as const,
          applied: 2,
          conflicts: [],
          filesChanged: ['a.gal', 'c.gal'],
          snapshotRef: 'ref1'
        })
      )
    })
    render(<ScriptSearchPanel />)
    typeQuery('艾')
    fireEvent.click(screen.getByTestId('script-replace-button'))

    // 对话框出现,两条匹配,默认全选
    expect(await screen.findByTestId('replace-preview-dialog')).toBeTruthy()
    await waitFor(() => {
      expect(screen.getAllByTestId('replace-preview-match')).toHaveLength(2)
    })
    expect(screen.getByTestId('replace-selected-count').textContent).toContain('已选 2/2')

    fireEvent.click(screen.getByTestId('replace-confirm-button'))
    await waitFor(() => {
      expect(api.replaceApply).toHaveBeenCalledWith({
        projectPath: '/p',
        replacement: '',
        matches: [
          { id: MATCH_A.id, file: 'a.gal', start: 6, end: 7, matchedText: '艾' },
          { id: MATCH_B.id, file: 'c.gal', start: 4, end: 5, matchedText: '艾' }
        ]
      })
    })
    // 成功 toast + 搜索刷新
    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'success' })
      )
    })
    expect(api.searchProject).toHaveBeenCalledWith('/p', '艾')
  })

  it('取消勾选一条 → 确认时只回传勾选项', async () => {
    const api = setGalideMock({
      replacePreview: vi.fn(() =>
        Promise.resolve({ ok: true as const, matches: [MATCH_A, MATCH_B], truncated: false })
      )
    })
    render(<ScriptSearchPanel />)
    typeQuery('艾')
    fireEvent.click(screen.getByTestId('script-replace-button'))
    await screen.findByTestId('replace-preview-dialog')

    const checkboxes = screen.getAllByTestId('replace-preview-checkbox')
    fireEvent.click(checkboxes[1] as Element)
    expect(screen.getByTestId('replace-selected-count').textContent).toContain('已选 1/2')

    fireEvent.click(screen.getByTestId('replace-confirm-button'))
    await waitFor(() => {
      expect(api.replaceApply).toHaveBeenCalledWith(
        expect.objectContaining({
          matches: [{ id: MATCH_A.id, file: 'a.gal', start: 6, end: 7, matchedText: '艾' }]
        })
      )
    })
  })

  it('零匹配 → 不弹对话框,提示无匹配可替换', async () => {
    setGalideMock({})
    render(<ScriptSearchPanel />)
    typeQuery('不存在')
    fireEvent.click(screen.getByTestId('script-replace-button'))
    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ message: '无匹配可替换' })
      )
    })
    expect(screen.queryByTestId('replace-preview-dialog')).toBeNull()
  })

  it('截断提示:truncated=true 时显示过多告警', async () => {
    setGalideMock({
      replacePreview: vi.fn(() =>
        Promise.resolve({ ok: true as const, matches: [MATCH_A], truncated: true })
      )
    })
    render(<ScriptSearchPanel />)
    typeQuery('艾')
    fireEvent.click(screen.getByTestId('script-replace-button'))
    expect(await screen.findByTestId('replace-truncated-notice')).toBeTruthy()
  })

  it('mode 切换:token 模式下 preview 携带 mode=token', async () => {
    const api = setGalideMock({})
    render(<ScriptSearchPanel />)
    fireEvent.click(screen.getByTestId('replace-mode-token'))
    typeQuery('艾')
    fireEvent.click(screen.getByTestId('script-replace-button'))
    await waitFor(() => {
      expect(api.replacePreview).toHaveBeenCalledWith({
        projectPath: '/p',
        query: '艾',
        mode: 'token'
      })
    })
  })
})
