/**
 * useAppearancePreferencesEffect — appearance 偏好 → documentElement 落盘单测
 *
 * 覆盖:
 *  - ACCENT_MAP 自身:4 个 key 齐全,light/dark 三元组均为合法 hex
 *  - accent → --accent/--accent-hover/--accent-soft inline 写入(light + dark 双档)
 *  - fontSans/fontMono → --font-sans/--font-mono(自定义值优先;'default'/空 → 移除内联回退默认栈)
 *  - reducedMotion → reduce-motion class toggle(开/关双向)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import type { AppearancePreferences } from '@shared/preferences'
import { useUiStore } from '../store'
import {
  ACCENT_MAP,
  DEFAULT_FONT_MONO_STACK,
  DEFAULT_FONT_SANS_STACK,
  useAppearancePreferencesEffect
} from './use-appearance-preferences'

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

const getMock = vi.fn<(key: string) => Promise<AppearancePreferences>>()

const setAppearance = (value: AppearancePreferences): void => {
  getMock.mockResolvedValue(value)
  const w = window as unknown as { galide: { preferences: { get: typeof getMock } } }
  w.galide = { preferences: { get: getMock } }
}

const baseAppearance: AppearancePreferences = {
  accent: 'violet',
  fontSans: 'default',
  fontMono: 'default',
  reducedMotion: false
}

let queryClient: QueryClient

const wrapper = ({ children }: { children: React.ReactNode }): JSX.Element =>
  React.createElement(QueryClientProvider, { client: queryClient }, children)

const rootVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  getMock.mockReset()
  useUiStore.setState({ theme: 'light' })
})

afterEach(() => {
  const root = document.documentElement
  for (const v of ['--accent', '--accent-hover', '--accent-soft', '--font-sans', '--font-mono']) {
    root.style.removeProperty(v)
  }
  root.classList.remove('reduce-motion')
  queryClient.clear()
})

describe('ACCENT_MAP', () => {
  it('4 个 accent key 齐全,light/dark 三元组均为合法 hex', () => {
    expect(Object.keys(ACCENT_MAP).sort()).toEqual(['blue', 'emerald', 'rose', 'violet'])
    for (const key of Object.keys(ACCENT_MAP) as (keyof typeof ACCENT_MAP)[]) {
      for (const mode of ['light', 'dark'] as const) {
        const t = ACCENT_MAP[key][mode]
        expect(t.accent).toMatch(HEX_RE)
        expect(t.hover).toMatch(HEX_RE)
        expect(t.soft).toMatch(HEX_RE)
      }
    }
  })

  it('violet 档与 global.css 既有默认 token 一致(默认无视觉变化)', () => {
    expect(ACCENT_MAP.violet.light).toEqual({
      accent: '#6366f1',
      hover: '#4f46e5',
      soft: '#eef2ff'
    })
    expect(ACCENT_MAP.violet.dark).toEqual({
      accent: '#818cf8',
      hover: '#6366f1',
      soft: '#1e1b4b'
    })
  })
})

describe('useAppearancePreferencesEffect', () => {
  it.each(['violet', 'blue', 'rose', 'emerald'] as const)(
    'light 档:accent=%s → --accent/--accent-hover/--accent-soft 写入',
    async (accent) => {
      setAppearance({ ...baseAppearance, accent })
      renderHook(() => useAppearancePreferencesEffect(), { wrapper })
      const t = ACCENT_MAP[accent].light
      await waitFor(() => expect(rootVar('--accent')).toBe(t.accent))
      expect(rootVar('--accent-hover')).toBe(t.hover)
      expect(rootVar('--accent-soft')).toBe(t.soft)
    }
  )

  it('dark 档:theme=dark 时写入 dark 三元组,theme 切回 light 重新写入', async () => {
    setAppearance({ ...baseAppearance, accent: 'blue' })
    useUiStore.setState({ theme: 'dark' })
    const { rerender } = renderHook(() => useAppearancePreferencesEffect(), { wrapper })
    await waitFor(() => expect(rootVar('--accent')).toBe(ACCENT_MAP.blue.dark.accent))
    expect(rootVar('--accent-soft')).toBe(ACCENT_MAP.blue.dark.soft)

    act(() => useUiStore.setState({ theme: 'light' }))
    rerender()
    await waitFor(() => expect(rootVar('--accent')).toBe(ACCENT_MAP.blue.light.accent))
  })

  it('fontSans/fontMono 自定义值 → inline var 以自定义字体开头并回落默认栈', async () => {
    setAppearance({ ...baseAppearance, fontSans: 'LXGW WenKai', fontMono: 'Maple Mono' })
    renderHook(() => useAppearancePreferencesEffect(), { wrapper })
    await waitFor(() =>
      expect(rootVar('--font-sans')).toBe(`LXGW WenKai, ${DEFAULT_FONT_SANS_STACK}`)
    )
    expect(rootVar('--font-mono')).toBe(`Maple Mono, ${DEFAULT_FONT_MONO_STACK}`)
  })

  it("'default'/空值 → 移除 inline var,回退样式表默认栈", async () => {
    // 先写入自定义,再切回 default — 验证 removeProperty 路径
    setAppearance({ ...baseAppearance, fontSans: 'LXGW WenKai', fontMono: 'Maple Mono' })
    const { rerender } = renderHook(() => useAppearancePreferencesEffect(), { wrapper })
    await waitFor(() => expect(rootVar('--font-sans')).toContain('LXGW WenKai'))

    setAppearance({ ...baseAppearance, fontSans: 'default', fontMono: '' })
    await queryClient.invalidateQueries({ queryKey: ['preferences', 'appearance'] })
    rerender()
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--font-sans')).toBe('')
    )
    expect(document.documentElement.style.getPropertyValue('--font-mono')).toBe('')
  })

  it('reducedMotion=true → 加 reduce-motion class;false → 移除', async () => {
    setAppearance({ ...baseAppearance, reducedMotion: true })
    const { rerender } = renderHook(() => useAppearancePreferencesEffect(), { wrapper })
    await waitFor(() =>
      expect(document.documentElement.classList.contains('reduce-motion')).toBe(true)
    )

    setAppearance({ ...baseAppearance, reducedMotion: false })
    await queryClient.invalidateQueries({ queryKey: ['preferences', 'appearance'] })
    rerender()
    await waitFor(() =>
      expect(document.documentElement.classList.contains('reduce-motion')).toBe(false)
    )
  })
})
