/**
 * useAppearancePreferencesEffect — 把 appearance 偏好(accent / fontSans / fontMono /
 * reducedMotion)落到 document.documentElement 上。
 *
 * 设计要点:
 *  - 数据源:usePreference('appearance')(React Query + IPC),与 use-appearance-effect
 *    的 theme class 同步互补;accent 三元组依赖当前 theme(light/dark 双档),
 *    因此 effect deps 同时订阅 useUiStore.theme。
 *  - 写入方式:inline style setProperty — 优先级高于 :root / .dark 样式表规则,
 *    单点覆盖即可同时穿透两档;theme 切换时 effect 重跑写入另一档值。
 *  - accent hex 唯一出处是下面的 ACCENT_MAP(violet 档与 global.css 现有默认值一致,
 *    保证默认无视觉变化)。
 *  - fontSans/fontMono:'default' / 空串 → removeProperty,回退 global.css :root 的
 *    自托管默认栈;其余值 → 内联 `"<自定义>", <默认栈>`(自定义优先,缺字形回落默认栈)。
 *  - reducedMotion → documentElement.toggle('reduce-motion'),CSS 规则在 global.css;
 *    MotionConfig 侧的消费见 main.tsx MotionApp。
 */

import { useEffect } from 'react'
import { usePreference } from './use-preferences'
import { useUiStore } from '../store'
import type { AppearancePreferences } from '@shared/preferences'

export type AccentTriplet = {
  accent: string
  hover: string
  soft: string
}

export const ACCENT_MAP: Record<
  AppearancePreferences['accent'],
  { light: AccentTriplet; dark: AccentTriplet }
> = {
  violet: {
    light: { accent: '#6366f1', hover: '#4f46e5', soft: '#eef2ff' },
    dark: { accent: '#818cf8', hover: '#6366f1', soft: '#1e1b4b' }
  },
  blue: {
    light: { accent: '#3b82f6', hover: '#2563eb', soft: '#eff6ff' },
    dark: { accent: '#60a5fa', hover: '#3b82f6', soft: '#172554' }
  },
  rose: {
    light: { accent: '#f43f5e', hover: '#e11d48', soft: '#fff1f2' },
    dark: { accent: '#fb7185', hover: '#f43f5e', soft: '#4c0519' }
  },
  emerald: {
    light: { accent: '#10b981', hover: '#059669', soft: '#ecfdf5' },
    dark: { accent: '#34d399', hover: '#10b981', soft: '#022c22' }
  }
}

export const DEFAULT_FONT_SANS_STACK =
  "'Inter Variable', 'Inter', 'Noto Sans SC', system-ui, sans-serif"
export const DEFAULT_FONT_MONO_STACK =
  "'JetBrains Mono Variable', 'JetBrains Mono', Menlo, monospace"

const isDefaultFontToken = (value: string): boolean => {
  const v = value.trim()
  return v === '' || v.toLowerCase() === 'default'
}

const applyFontVar = (
  root: HTMLElement,
  varName: '--font-sans' | '--font-mono',
  value: string,
  fallbackStack: string
): void => {
  if (isDefaultFontToken(value)) {
    root.style.removeProperty(varName)
  } else {
    root.style.setProperty(varName, `${value.trim()}, ${fallbackStack}`)
  }
}

export const useAppearancePreferencesEffect = (): void => {
  const theme = useUiStore((s) => s.theme)
  const { data } = usePreference('appearance')
  const appearance = data as AppearancePreferences | null | undefined

  useEffect(() => {
    if (typeof document === 'undefined' || !appearance) return
    const root = document.documentElement

    const triplet =
      ACCENT_MAP[appearance.accent]?.[theme === 'dark' ? 'dark' : 'light'] ??
      ACCENT_MAP.violet[theme === 'dark' ? 'dark' : 'light']
    root.style.setProperty('--accent', triplet.accent)
    root.style.setProperty('--accent-hover', triplet.hover)
    root.style.setProperty('--accent-soft', triplet.soft)

    applyFontVar(root, '--font-sans', appearance.fontSans ?? '', DEFAULT_FONT_SANS_STACK)
    applyFontVar(root, '--font-mono', appearance.fontMono ?? '', DEFAULT_FONT_MONO_STACK)

    root.classList.toggle('reduce-motion', appearance.reducedMotion === true)
  }, [appearance, theme])
}
