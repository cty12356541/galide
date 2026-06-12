/**
 * PreviewRuntime — PixiJS v8 预览运行时封装
 *
 * 规约依据: .style-spec/core/conventions.yaml:19 `game_runtime: "PixiJS v8"`
 * 职责: 把 PixiJS v8 的 Application 创建/销毁/场景更新封装成稳定 API,
 *      让上层 (PreviewCanvas.tsx) 只关心 React 生命周期。
 *
 * 设计原则:
 * 1. Pixi v8 强制要求 `await app.init({...})`(不要传构造选项)
 * 2. 只渲染背景(Sprite 加载 SceneNode.background 路径);对话气泡继续走 HTML overlay(字体加载不在本 worker 范围)
 * 3. 资源加载失败必须降级到背景色,绝不抛
 * 4. 单实例:一个 PreviewRuntime 对应一个 HTMLCanvasElement
 */

import { Application, Assets, Container, Sprite, Texture } from 'pixi.js'
import type { SceneNode } from '../../../../shared/dsl/types'

export type PreviewState = 'idle' | 'playing' | 'paused' | 'stopped'

export type PreviewOptions = {
  width?: number
  height?: number
  backgroundColor?: number
  fallbackBackgroundColor?: number
}

/** 内部用:背景层与状态 */
type RuntimeState = {
  app: Application
  backgroundLayer: Container
  currentBackgroundUrl: string | null
  state: PreviewState
}

const DEFAULT_BG_COLOR = 0x1a1a1a

export const createPreviewRuntime = (options: PreviewOptions = {}) => {
  let state: RuntimeState | null = null

  const isMounted = (): boolean => state !== null

  const mount = async (canvas: HTMLCanvasElement): Promise<void> => {
    if (state) return
    const app = new Application()
    await app.init({
      canvas,
      width: options.width ?? canvas.clientWidth ?? 640,
      height: options.height ?? canvas.clientHeight ?? 360,
      backgroundColor: options.backgroundColor ?? DEFAULT_BG_COLOR,
      antialias: true,
      autoStart: false,
      preference: 'webgl'
    })
    const backgroundLayer = new Container()
    app.stage.addChild(backgroundLayer)
    state = {
      app,
      backgroundLayer,
      currentBackgroundUrl: null,
      state: 'idle'
    }
  }

  const unmount = (): void => {
    if (!state) return
    state.app.destroy(true, { children: true, texture: true })
    state = null
  }

  /**
   * 加载背景图并替换背景层。
   * 资源不可用时,降级到 fallback 背景色,不抛异常。
   */
  const setBackground = async (url: string | undefined): Promise<void> => {
    if (!state) return
    const { app, backgroundLayer } = state
    if (state.currentBackgroundUrl === (url ?? null)) return
    backgroundLayer.removeChildren()
    if (!url) {
      app.renderer.background.color = options.fallbackBackgroundColor ?? DEFAULT_BG_COLOR
      state.currentBackgroundUrl = null
      return
    }
    try {
      const texture: Texture = await Assets.load({ src: url })
      const sprite = new Sprite(texture)
      const scale = Math.min(
        app.renderer.width / sprite.width,
        app.renderer.height / sprite.height
      )
      sprite.scale = scale
      sprite.x = (app.renderer.width - sprite.width * scale) / 2
      sprite.y = (app.renderer.height - sprite.height * scale) / 2
      backgroundLayer.addChild(sprite)
      state.currentBackgroundUrl = url
    } catch (err) {
      // P1-6 修复: 资源加载失败不再静默,留 warn 便于排错
      console.warn(`[galide preview] 背景图加载失败: ${url}`, err)
      app.renderer.background.color = options.fallbackBackgroundColor ?? DEFAULT_BG_COLOR
      state.currentBackgroundUrl = null
    }
  }

  /**
   * 用 SceneNode 更新当前场景的视觉层。
   * 当前只取 background;dialogue/sprite 由 React overlay 渲染。
   */
  const updateScene = (scene: SceneNode | null): Promise<void> => {
    if (!state) return Promise.resolve()
    if (!scene) {
      return setBackground(undefined)
    }
    return setBackground(scene.background)
  }

  const playScene = (): void => {
    if (!state) return
    state.app.ticker.start()
    state.state = 'playing'
    notifySubscribers()
  }

  const stopScene = (): void => {
    if (!state) return
    state.app.ticker.stop()
    state.state = 'stopped'
    notifySubscribers()
  }

  const getState = (): PreviewState => state?.state ?? 'idle'

  const getApp = (): Application | null => state?.app ?? null

  // P0-5 修复: 暴露订阅接口,React 端能正确响应播放/停止状态变化
  // (原版用 runtimeRef.current.getState() 在 render 中读,变化不触发重渲染 → 图标永远不更新)
  const subscribers = new Set<(s: PreviewState) => void>()
  const notifySubscribers = (): void => {
    const current = getState()
    for (const cb of subscribers) cb(current)
  }
  const subscribeState = (cb: (s: PreviewState) => void): (() => void) => {
    subscribers.add(cb)
    // 立即同步当前状态
    cb(getState())
    return () => {
      subscribers.delete(cb)
    }
  }

  return {
    mount,
    unmount,
    updateScene,
    playScene,
    stopScene,
    isMounted,
    getState,
    getApp,
    subscribeState
  }
}

export type PreviewRuntime = ReturnType<typeof createPreviewRuntime>
