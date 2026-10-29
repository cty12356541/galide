/**
 * PreviewDebugger 集成组件测试(Phase 2 T2-2)
 *
 * 覆盖完整链路:
 * SceneRail / OutlinePanel 设断点(持久化 localStorage) → PreviewCanvas 播放/继续 →
 * 命中断点暂停 + Banner 提示 → 变量监视列表 & 全变量表展示与变更闪变 → 继续恢复至结束。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { parse } from '../../../../shared/dsl/parser'
import { PreviewCanvas } from './PreviewCanvas'
import { SceneRail } from '../../components/workspace/SceneRail'
import { OutlinePanel } from '../outline/OutlinePanel'
import {
  BREAKPOINTS_STORAGE_KEY,
  WATCHES_STORAGE_KEY,
  resetDebugStore,
  useDebugStore
} from './debug-store'
import { useUiStore, useErrorStore } from '../../lib/store'

vi.mock('./use-preview-runtime', () => ({
  usePreviewRuntime: () => undefined
}))

const SCRIPT_SOURCE = [
  '## ch1',
  '旁白: "序幕第一句"',
  '设: affinity = 5',
  '=== skip_bp ===',
  '设: affinity += 10',
  '[若: affinity >= 12]',
  '设: route = "true_end"',
  '=== hit_bp ===',
  '小雪: "真结局对白"',
  '[否则]',
  '设: route = "normal"',
  '[若终]',
  '旁白: "终幕收尾"'
].join('\n')

const renderWithQuery = (ui: JSX.Element) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('PreviewDebugger UI (T2-2)', () => {
  let storageMap: Map<string, string>

  beforeEach(() => {
    storageMap = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storageMap.set(k, v)
        },
        removeItem: (k: string) => {
          storageMap.delete(k)
        },
        clear: () => {
          storageMap.clear()
        }
      },
      configurable: true
    })
    resetDebugStore()
    useErrorStore.getState().clear()
    const parsed = parse(SCRIPT_SOURCE)
    if (!parsed.ok) throw new Error('parse failed')

    ;(window as unknown as { galide: Record<string, unknown> }).galide = {
      asset: { resolve: vi.fn(async () => ({ ok: false })) },
      preferences: { get: vi.fn(async () => ({ previewEnabled: false })) },
      voice: { generate: vi.fn(async () => ({ ok: false })) },
      preview: {
        listSlots: vi.fn(async () => ({ ok: true, slots: [] })),
        saveSlot: vi.fn(async () => ({ ok: true, timestamp: 'now' })),
        loadSlot: vi.fn(async () => ({ ok: false, error: 'empty' })),
        loadReadState: vi.fn(async () => ({ readLineIds: [] })),
        saveReadState: vi.fn(async () => ({ ok: true }))
      }
    }

    useUiStore.setState({
      projectPath: '/mock/proj',
      projectName: 'Demo',
      manifest: {
        name: 'Demo',
        version: '0.1.0',
        characters: []
      } as never,
      scriptAst: parsed.value,
      projectMergedAst: parsed.value,
      projectParseError: null,
      selectedSceneId: 'ch1'
    })
  })

  it('sets marker breakpoint from SceneRail/Outline, pauses on hit, displays watched & all variables with flash, and continues to end', async () => {
    renderWithQuery(
      <div>
        <SceneRail />
        <OutlinePanel />
        <PreviewCanvas />
      </div>
    )

    // 1. SceneRail & OutlinePanel both show markers; click breakpoint gutter on hit_bp
    const railBpBtn = await screen.findByTestId('scene-rail-bp-hit_bp')
    expect(railBpBtn.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(railBpBtn)
    expect(railBpBtn.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('outline-bp-hit_bp').getAttribute('aria-pressed')).toBe('true')
    expect(JSON.parse(window.localStorage.getItem(BREAKPOINTS_STORAGE_KEY) ?? '[]')).toEqual([
      'hit_bp'
    ])

    // 2. Open debugger panel and add "affinity" to watch list
    fireEvent.click(screen.getByTestId('preview-debug-toggle'))
    const watchInput = await screen.findByTestId('debug-watch-input')
    fireEvent.change(watchInput, { target: { value: 'affinity' } })
    fireEvent.click(screen.getByTestId('debug-watch-add'))
    expect(JSON.parse(window.localStorage.getItem(WATCHES_STORAGE_KEY) ?? '[]')).toEqual([
      'affinity'
    ])
    expect(screen.getByTestId('debug-watch-row-affinity').textContent).toContain('<未定义>')

    // 3. Click "继续" (Continue): skips skip_bp and pauses at hit_bp!
    fireEvent.click(screen.getByTestId('debug-continue'))

    const banner = await screen.findByTestId('debug-breakpoint-banner')
    expect(banner.textContent).toContain('命中断点:')
    expect(banner.textContent).toContain('hit_bp')

    // Variable watch & all-variables table display updated values & flash highlight
    const watchAffinity = screen.getByTestId('debug-watch-row-affinity')
    expect(watchAffinity.textContent).toContain('15')
    const allRoute = screen.getByTestId('debug-var-row-route')
    expect(allRoute.textContent).toContain('"true_end"')
    expect(allRoute.getAttribute('data-flashed')).toBe('true')

    // 4. Click "继续" again -> resumes past hit_bp through remaining dialogues to end
    fireEvent.click(screen.getByTestId('debug-continue'))
    await waitFor(() => {
      expect(screen.queryByTestId('debug-breakpoint-banner')).toBeNull()
    })
    expect(screen.getByText('场景播放完毕')).toBeTruthy()

    // 5. Click "停止" -> resets back to scene start
    fireEvent.click(screen.getByTestId('debug-stop'))
    expect(await screen.findByText('序幕第一句')).toBeTruthy()
    expect(useDebugStore.getState().breakpoints).toEqual(['hit_bp'])
  })
})
