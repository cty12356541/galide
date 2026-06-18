/**
 * useAppearanceEffect — 同步 theme 到 document.documentElement.dark class
 *
 * 设计要点:
 *  - 订阅 useUiStore((s) => s.theme),effect 内 toggle 'dark' class。
 *  - 单次调用 mount-only 即可(App.tsx 顶层 useAppearanceEffect()),
 *    后续 setTheme 也会触发重新 toggle。
 *  - document 不存在时(SSR / 测试环境)early return,不 throw。
 *  - 与 store.ts:setTheme 内部的即时同步是双保险:这里负责外部修改(zustand devtools /
 *    hydrate)的二次同步,setTheme 内部负责 set 时的即时同步。
 *
 * 与 store.ts:setTheme 的关系:
 *  - store.ts:setTheme 写入时已经 toggle('dark'),这里订阅 store 后再次 toggle 是
 *    idempotent — 同一状态 toggle 两次等于无操作。
 *  - 真正的作用是:外部修改 theme(zustand devtools / 测试 setState)时,
 *    useAppearanceEffect 监听 theme 变化同步 DOM class。
 */

import { useEffect } from 'react'
import { useUiStore } from '../store'

export const useAppearanceEffect = (): void => {
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
  }, [theme])
}
