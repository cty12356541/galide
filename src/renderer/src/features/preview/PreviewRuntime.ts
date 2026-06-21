/**
 * PreviewRuntime — PixiJS v8 预览运行时封装
 *
 * 规约依据: .style-spec/core/conventions.yaml:19 `game_runtime: "PixiJS v8"`
 * 职责: 背景 + 立绘层;对话气泡走 HTML overlay。
 */

import { Application, Assets, Container, Sprite, Texture } from 'pixi.js'
import type { SceneNode } from '../../../../shared/dsl/types'
export type PreviewState = 'idle' | 'playing' | 'paused' | 'stopped'
export type SpritePosition = 'left' | 'center' | 'right'

export type PreviewOptions = {
  width?: number
  height?: number
  backgroundColor?: number
  fallbackBackgroundColor?: number
}

type RuntimeState = {
  app: Application
  backgroundLayer: Container
  characterLayer: Container
  currentBackgroundUrl: string | null
  currentSpriteKey: string | null
  state: PreviewState
}

const DEFAULT_BG_COLOR = 0x1a1a1a

const positionX = (
  position: SpritePosition,
  spriteWidth: number,
  stageWidth: number
): number => {
  switch (position) {
    case 'left':
      return stageWidth * 0.08
    case 'right':
      return stageWidth * 0.92 - spriteWidth
    default:
      return (stageWidth - spriteWidth) / 2
  }
}

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
    const characterLayer = new Container()
    app.stage.addChild(backgroundLayer)
    app.stage.addChild(characterLayer)
    state = {
      app,
      backgroundLayer,
      characterLayer,
      currentBackgroundUrl: null,
      currentSpriteKey: null,
      state: 'idle'
    }
  }

  const unmount = (): void => {
    if (!state) return
    state.app.destroy(true, { children: true, texture: true })
    state = null
  }

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
      console.warn(`[galide preview] 背景图加载失败: ${url}`, err)
      app.renderer.background.color = options.fallbackBackgroundColor ?? DEFAULT_BG_COLOR
      state.currentBackgroundUrl = null
    }
  }

  /**
   * 更新立绘层。相同 sprite+position 不重复加载(VN 持久语义)。
   * url 为空时清除立绘。
   */
  const setCharacter = async (
    url: string | undefined,
    position: SpritePosition = 'center'
  ): Promise<void> => {
    if (!state) return
    const key = url ? `${url}|${position}` : null
    if (state.currentSpriteKey === key) return
    state.characterLayer.removeChildren()
    state.currentSpriteKey = key
    if (!url) return
    try {
      const texture: Texture = await Assets.load({ src: url })
      const sprite = new Sprite(texture)
      const maxHeight = state.app.renderer.height * 0.85
      const scale = Math.min(1, maxHeight / sprite.height)
      sprite.scale = scale
      sprite.x = positionX(position, sprite.width * scale, state.app.renderer.width)
      sprite.y = state.app.renderer.height - sprite.height * scale
      state.characterLayer.addChild(sprite)
    } catch (err) {
      console.warn(`[galide preview] 立绘加载失败: ${url}`, err)
      state.currentSpriteKey = null
    }
  }

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

  const subscribers = new Set<(s: PreviewState) => void>()
  const notifySubscribers = (): void => {
    const current = getState()
    for (const cb of subscribers) cb(current)
  }
  const subscribeState = (cb: (s: PreviewState) => void): (() => void) => {
    subscribers.add(cb)
    cb(getState())
    return () => {
      subscribers.delete(cb)
    }
  }

  return {
    mount,
    unmount,
    updateScene,
    setBackground,
    setCharacter,
    playScene,
    stopScene,
    isMounted,
    getState,
    getApp,
    subscribeState
  }
}

export type PreviewRuntime = ReturnType<typeof createPreviewRuntime>
