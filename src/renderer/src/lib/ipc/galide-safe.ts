/**
 * window.galide 安全访问器
 *
 * 规约依据: .style-spec/layers/renderer/conventions.yaml#ipc_abstraction
 *           "所有 IPC 调用封装在 src/renderer/lib/ipc/ 目录下"
 *
 * 为什么需要:preload 脚本注入前 `window.galide` 是 undefined;
 *            注入过程 React render 与 IPC 通道就绪之间有时序竞争;
 *            React StrictMode 双重 mount 期间还可能再次错位。
 *            任何同步访问必须 try/catch,任何 async 包装必须降级到
 *            明确错误返回,绝不能让 AiPanel / FlowView 等组件
 *            在 render 阶段 throw → 红屏。
 *
 * P0-10 修复(2026-06-15): 用 preload 真实导出的 GalideApi 类型替换
 *   Record<string, unknown>,消除 use-* hook 访问 g.x 时 7+ TS2339 错误。
 *   现在 window.galide.ai.generate / g.workspace.readProject 等都强类型,
 *   拼错字段编译期就报错,不再依赖 stringly-typed 反射。
 */

import type { GalideApi } from '../../../../preload'

/**
 * 全局 Window 类型增强:preload 通过 contextBridge 把 galide API 挂到 window。
 * 此声明让 renderer 各处 `window.galide.*` 强类型(原声明随 galide-api.ts 删除丢失,补回)。
 */
declare global {
  interface Window {
    galide: GalideApi
  }
}

/** 拿到 window.galide(任何阶段为 undefined 返回 null,不抛) */
export const getGalide = (): GalideApi | null => {
  if (typeof window === 'undefined') return null
  const g = (window as unknown as { galide?: GalideApi }).galide
  return g ?? null
}

/** 拿到 window.galide.ai(IPC 通道可能未注入时为 null) */
export const getGalideAi = (): GalideApi['ai'] | null => {
  const g = getGalide()
  if (!g) return null
  const ai = g.ai
  if (typeof ai !== 'object' || ai === null) return null
  return ai
}

/**
 * crypto.randomUUID 安全包装
 *
 * happy-dom 旧版本 / jsdom 不实现 crypto.randomUUID;
 * Electron 渲染进程(Chromium)有,但 hot-reload 期间偶尔缺失。
 * 失败时降级到时间戳+随机数,保证 UI 不崩。
 */
export const safeRandomUUID = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  // 降级方案:时间戳 + 4 位随机 hex,碰撞概率足够小(id 仅用于 React key / IPC 关联)
  const t = Date.now().toString(36)
  const r = Math.floor(Math.random() * 0xffff)
  return `${t}-${r.toString(16).padStart(4, '0')}`
}
