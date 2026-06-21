import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPreviewAudioController, type PreviewAudioController } from './preview-audio'

interface MockGainNode {
  gain: {
    value: number
    setValueAtTime: ReturnType<typeof vi.fn>
    linearRampToValueAtTime: ReturnType<typeof vi.fn>
  }
  connect: ReturnType<typeof vi.fn>
}

interface MockBufferSource {
  buffer: AudioBuffer | null
  loop: boolean
  connect: ReturnType<typeof vi.fn>
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
}

interface MockAudioContext {
  state: string
  currentTime: number
  destination: object
  createGain: () => MockGainNode
  createBufferSource: () => MockBufferSource
  decodeAudioData: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

const createMockContext = (): MockAudioContext => {
  const createGain = (): MockGainNode => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn()
    },
    connect: vi.fn()
  })

  return {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain,
    createBufferSource: () => ({
      buffer: null,
      loop: false,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn()
    }),
    decodeAudioData: vi.fn(async (_buf: ArrayBuffer) => ({ duration: 1, sampleRate: 44100, length: 100, numberOfChannels: 2, getChannelData: () => new Float32Array(100) } as unknown as AudioBuffer)),
    close: vi.fn(async () => undefined)
  }
}

describe('createPreviewAudioController', () => {
  let controller: PreviewAudioController
  let mockCtx: MockAudioContext

  beforeEach(() => {
    mockCtx = createMockContext()
    controller = createPreviewAudioController({
      createContext: () => mockCtx as unknown as AudioContext,
      loadAudio: vi.fn(async () => new ArrayBuffer(8))
    })
  })

  afterEach(() => {
    controller.dispose()
  })

  it('starts unmuted with default volume', () => {
    expect(controller.getVolume()).toBe(1)
    expect(controller.isMuted()).toBe(false)
  })

  it('tracks current track id after play', async () => {
    await controller.play('assets/bgm/a.mp3', 'file:///a.mp3')
    expect(controller.getCurrentTrack()).toBe('assets/bgm/a.mp3')
  })

  it('crossfades when switching tracks', async () => {
    await controller.play('assets/bgm/a.mp3', 'file:///a.mp3')
    await controller.play('assets/bgm/b.mp3', 'file:///b.mp3')
    expect(controller.getCurrentTrack()).toBe('assets/bgm/b.mp3')
  })

  it('stop clears current track', async () => {
    await controller.play('assets/bgm/a.mp3', 'file:///a.mp3')
    controller.stop()
    expect(controller.getCurrentTrack()).toBeNull()
  })

  it('mute silences output gain', () => {
    controller.setMuted(true)
    expect(controller.isMuted()).toBe(true)
    controller.setVolume(0.5)
    expect(controller.getVolume()).toBe(0.5)
  })

  it('does not throw when load fails', async () => {
    const failing = createPreviewAudioController({
      createContext: () => mockCtx as unknown as AudioContext,
      loadAudio: vi.fn(async () => {
        throw new Error('missing')
      })
    })
    await expect(failing.play('x.mp3', 'file:///x.mp3')).resolves.toBeUndefined()
    expect(failing.getCurrentTrack()).toBeNull()
    failing.dispose()
  })
})
