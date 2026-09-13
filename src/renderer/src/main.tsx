/// <reference types="vite/client" />
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig, useReducedMotion } from 'framer-motion'
import { TooltipProvider } from './components/ui/tooltip'
import { Toaster } from './components/ui/toast'
import { usePreference } from './lib/ipc/use-preferences'
import type { AppearancePreferences } from '@shared/preferences'
import { App } from './app/App'
// 自托管字体(@fontsource)— 运行时零 CDN。Noto Sans SC 走 unicode-range 分包,
// 浏览器只下载实际用到的区段;Inter / JetBrains Mono 用 variable 版覆盖全字重。
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/noto-sans-sc/400.css'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000
    }
  }
})

const rootEl = document.getElementById('root')!

// P1-9 修复: 生产期隐藏 stack,只暴露 error.message;开发期保留 stack。
// 避免生产用户看到内部文件路径 / 框架内部信息。
const isDev = import.meta.env.DEV

const showError = (label: string, err: unknown): void => {
  const summary = err instanceof Error ? err.message : String(err)
  const detail = isDev && err instanceof Error ? `\n${err.stack ?? ''}` : ''
  const pre = document.createElement('pre')
  pre.style.cssText =
    'position:fixed;inset:0;background:#7f1d1d;color:#fff;padding:24px;overflow:auto;white-space:pre-wrap;font:13px/1.5 monospace;z-index:99999;'
  pre.textContent = `[galide boot error] ${label}\n\n${summary}${detail}`
  document.body.appendChild(pre)
}

const handleError = (label: string, err: unknown): void => {
  if (isDev) {
    showError(label, err)
  } else {
    // 生产期:仅 console.error,UI 走 error store / 友好提示
    console.error(`[galide] ${label}:`, err)
  }
}

window.addEventListener('error', (e) => handleError('window.error', e.error ?? e.message))
window.addEventListener('unhandledrejection', (e) => handleError('unhandledrejection', e.reason))

function MotionApp(): JSX.Element {
  // 系统媒体查询(useReducedMotion 订阅变化)|| 用户偏好「减少动画」 — 任一开启即 always。
  const systemReduced = useReducedMotion() ?? false
  const { data } = usePreference('appearance')
  const prefReduced =
    (data as AppearancePreferences | null | undefined)?.reducedMotion === true
  const reduced = systemReduced || prefReduced
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>
      <App />
    </MotionConfig>
  )
}

try {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <MotionApp />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </React.StrictMode>
  )
} catch (err) {
  showError('createRoot.render threw synchronously', err)
}

