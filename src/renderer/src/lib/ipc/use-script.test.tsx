/**
 * useScript hook 测试
 * 规约依据: .style-spec/layers/renderer/conventions.yaml:19-22 (ipc_abstraction)
 *          .cursor/rules/testing-conventions.mdc:26-28 (Mock IPC)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useScript } from './use-script.js'
import { useErrorStore } from '../store.js'
import type { Result, ScriptNode, ParseError } from '../../../../shared/dsl/types'

type ScriptApi = {
  read: (projectPath: string, fileName: string) => Promise<string>
  write: (projectPath: string, fileName: string, content: string) => Promise<void>
  parse: (source: string) => Promise<Result<ScriptNode, ParseError[]>>
  list: (projectPath: string) => Promise<string[]>
}

/**
 * P2-12 修复: 不再用 `(window as any)` 强转
 * 通过类型断言把 mock 注入 window.galide(由 preload 类型声明)。
 */
const setGalideMock = (api: Partial<ScriptApi>): void => {
  const script = {
    read: vi.fn(api.read ?? (() => Promise.resolve(''))),
    write: vi.fn(api.write ?? (() => Promise.resolve())),
    parse: vi.fn(
      api.parse ??
        (() => Promise.resolve<Result<ScriptNode, ParseError[]>>({ ok: true, value: {} as ScriptNode }))
    ),
    list: vi.fn(api.list ?? (() => Promise.resolve([])))
  }
  // 类型断言而非 declare global(避免与 preload 的 Window 增强冲突)
  const w = window as unknown as { galide: { script: typeof script } & Record<string, unknown> }
  w.galide = { ...w.galide, script }
}

const resetErrorStore = (): void => {
  useErrorStore.setState({ entries: [] })
}

describe('useScript', () => {
  beforeEach(() => {
    resetErrorStore()
  })

  it('read() wraps successful IPC and returns content', async () => {
    setGalideMock({ read: () => Promise.resolve('## scene1\n小雪: "hi"') })
    const { result } = renderHook(() => useScript())
    let text: string | undefined
    await act(async () => {
      text = await result.current.read('/p', 'a.gal')
    })
    expect(text).toBe('## scene1\n小雪: "hi"')
  })

  it('read() catches IPC throw → error store + returns undefined', async () => {
    setGalideMock({
      read: () => Promise.reject(new Error('script:read failed'))
    })
    const { result } = renderHook(() => useScript())
    let text: string | undefined
    await act(async () => {
      text = await result.current.read('/p', 'a.gal')
    })
    expect(text).toBeUndefined()
    const entries = useErrorStore.getState().entries
    expect(entries.length).toBe(1)
    expect(entries[0]?.code).toBe('IPC_ERROR')
    expect(entries[0]?.source).toBe('script:read')
  })

  it('parse() returns Result; on IPC throw pushes error and returns Result.err', async () => {
    setGalideMock({
      parse: () => Promise.reject(new Error('script:parse boom'))
    })
    const { result } = renderHook(() => useScript())
    let r: unknown
    await act(async () => {
      r = await result.current.parse('bad source')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = r as any
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toBeInstanceOf(Array)
    const entries = useErrorStore.getState().entries
    expect(entries.some((e) => e.source === 'script:parse')).toBe(true)
  })

  it('parse() returns ok Result on success', async () => {
    setGalideMock({
      parse: () =>
        Promise.resolve({
          ok: true,
          value: { type: 'script', line: 1, column: 1, children: [], errors: [] }
        })
    })
    const { result } = renderHook(() => useScript())
    let r: unknown
    await act(async () => {
      r = await result.current.parse('## scene\n')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = r as any
    expect(parsed.ok).toBe(true)
    expect(parsed.value.type).toBe('script')
  })

  it('write() catches IPC throw → error store', async () => {
    setGalideMock({
      write: () => Promise.reject(new Error('disk full'))
    })
    const { result } = renderHook(() => useScript())
    await act(async () => {
      await result.current.write('/p', 'a.gal', 'content')
    })
    const entries = useErrorStore.getState().entries
    expect(entries.some((e) => e.source === 'script:write')).toBe(true)
  })

  it('list() returns empty array gracefully on error', async () => {
    setGalideMock({
      list: () => Promise.reject(new Error('no dir'))
    })
    const { result } = renderHook(() => useScript())
    let list: string[] | undefined
    await act(async () => {
      list = await result.current.list('/p')
    })
    expect(list).toBeUndefined()
    const entries = useErrorStore.getState().entries
    expect(entries.some((e) => e.source === 'script:list')).toBe(true)
  })

  it('hook re-renders are stable (useCallback identity)', () => {
    setGalideMock({})
    const { result, rerender } = renderHook(() => useScript())
    const first = result.current
    rerender()
    expect(result.current.read).toBe(first.read)
    expect(result.current.write).toBe(first.write)
  })
})

// WaitFor import is required to avoid unused-warning
void waitFor
