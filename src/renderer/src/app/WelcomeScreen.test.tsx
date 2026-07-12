import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { getGalide } from '../lib/ipc/galide-safe'
import { WelcomeScreen } from './WelcomeScreen'
import { useErrorStore } from '../lib/store'

type GalideApi = NonNullable<ReturnType<typeof getGalide>>

const TUTORIAL_SEEN_KEY = 'galide:tutorialSeen'

const createMock = vi.fn()
const createAtPathMock = vi.fn()
const openMock = vi.fn()
const openPathMock = vi.fn()
const recordRecentMock = vi.fn()
const listRecentMock = vi.fn()
const saveMock = vi.fn()
const closeMock = vi.fn()
const scriptWriteMock = vi.fn()
const chooseDirectoryMock = vi.fn()

const mockGalide: GalideApi = {
  project: {
    create: createMock,
    createAtPath: createAtPathMock,
    open: openMock,
    openPath: openPathMock,
    save: saveMock,
    close: closeMock,
    recordRecent: recordRecentMock,
    listRecent: listRecentMock,
    onOpened: vi.fn(() => vi.fn())
  },
  script: {
    read: vi.fn(),
    write: scriptWriteMock,
    parse: vi.fn(),
    list: vi.fn(),
    parseProject: vi.fn(),
    searchProject: vi.fn(),
    onChanged: vi.fn(() => vi.fn())
  },
  git: {
    init: vi.fn(),
    status: vi.fn(),
    commit: vi.fn(),
    log: vi.fn(),
    diff: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    getRemotes: vi.fn(),
    setRemote: vi.fn()
  },
  export: {
    start: vi.fn(),
    cancel: vi.fn(),
    onProgress: vi.fn(() => vi.fn())
  },
  ai: {
    generate: vi.fn(),
    cancel: vi.fn(),
    listTasks: vi.fn(),
    stream: vi.fn(() => vi.fn()),
    onStatus: vi.fn(() => vi.fn()),
    listProviders: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    keySet: vi.fn(),
    keyDelete: vi.fn(),
    keyHas: vi.fn(),
    connectionTest: vi.fn(),
    connTestStream: vi.fn(() => vi.fn()),
    connTestStatus: vi.fn(() => vi.fn()),
    agent: {
      start: vi.fn(),
      cancel: vi.fn(),
      confirm: vi.fn(),
      onStep: vi.fn(() => vi.fn()),
      onStatus: vi.fn(() => vi.fn()),
      onConfirmRequest: vi.fn(() => vi.fn())
    }
  },
  agent: {
    onDispatchCommand: vi.fn(() => vi.fn()),
    dispatchResult: vi.fn()
  },
  preferences: {
    get: vi.fn(),
    set: vi.fn(),
    reset: vi.fn(),
    sectionReset: vi.fn(),
    getCacheDir: vi.fn(),
    clearCache: vi.fn()
  },
  shortcuts: {
    get: vi.fn(),
    set: vi.fn(),
    reset: vi.fn()
  },
  character: {
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    delete: vi.fn()
  },
  voice: {
    generate: vi.fn(),
    preview: vi.fn(),
    list: vi.fn(),
    delete: vi.fn()
  },
  store: {
    get: vi.fn(),
    set: vi.fn()
  },
  dialog: {
    chooseDirectory: chooseDirectoryMock,
    confirm: vi.fn(),
    prompt: vi.fn()
  },
  asset: {
    list: vi.fn(),
    resolve: vi.fn(),
    import: vi.fn(),
    delete: vi.fn()
  },
  image: {
    generate: vi.fn()
  },
  workspace: {
    openPanel: vi.fn(),
    onPanelClosed: vi.fn(() => vi.fn()),
    closePanel: vi.fn(),
    focusMain: vi.fn()
  },
  preview: {
    saveSlot: vi.fn(),
    loadSlot: vi.fn(),
    listSlots: vi.fn()
  }
} as unknown as GalideApi

const setupMocks = (): void => {
  listRecentMock.mockResolvedValue({ ok: true, items: [] })
  chooseDirectoryMock.mockResolvedValue({ ok: true, path: '/mock/projects' })
  createAtPathMock.mockResolvedValue({
    ok: true,
    projectPath: '/mock/projects/Galide示例项目',
    manifest: {
      version: '0.1.0' as const,
      name: 'Galide示例项目',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      characters: [],
      assets: {
        characters: 'assets/characters',
        backgrounds: 'assets/backgrounds',
        bgm: 'assets/bgm'
      },
      git: { initialized: false }
    }
  })
  scriptWriteMock.mockResolvedValue({ ok: true })
  recordRecentMock.mockResolvedValue({ ok: true })
}

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => { store[key] = value },
    removeItem: (key: string): void => { delete store[key] },
    clear: (): void => { store = {} }
  }
})()

describe('WelcomeScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })
    localStorage.clear()
    useErrorStore.setState({ entries: [] })
    setupMocks()
    const w = window as unknown as { galide: GalideApi }
    w.galide = mockGalide
  })

  it('renders the three main action buttons', () => {
    render(<WelcomeScreen />)
    expect(screen.getByText('新建项目')).toBeTruthy()
    expect(screen.getByText('打开项目')).toBeTruthy()
    expect(screen.getByText('打开示例项目')).toBeTruthy()
  })

  it('shows tutorial overlay when localStorage flag is absent', () => {
    render(<WelcomeScreen />)
    expect(screen.getByTestId('tutorial-overlay')).toBeTruthy()
    expect(screen.getByText('新手引导')).toBeTruthy()
    expect(screen.getByText('创建项目')).toBeTruthy()
    expect(screen.getByText('编写剧本')).toBeTruthy()
    expect(screen.getByText('预览导出')).toBeTruthy()
  })

  it('clicking skip hides the overlay and persists the flag', async () => {
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByTestId('tutorial-skip-primary'))
    await waitFor(() => {
      expect(screen.queryByTestId('tutorial-overlay')).toBeNull()
    })
    expect(localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe('true')
  })

  it('does not show tutorial overlay on second launch', () => {
    localStorage.setItem(TUTORIAL_SEEN_KEY, 'true')
    render(<WelcomeScreen />)
    expect(screen.queryByTestId('tutorial-overlay')).toBeNull()
  })

  it('sample project button calls createAtPath and writes sample scripts', async () => {
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByTestId('welcome-open-sample'))

    await waitFor(() => {
      expect(chooseDirectoryMock).toHaveBeenCalledWith({ title: '选择示例项目存放位置' })
    })

    await waitFor(() => {
      expect(createAtPathMock).toHaveBeenCalledWith({
        name: 'Galide示例项目',
        projectPath: '/mock/projects/Galide示例项目'
      })
    })

    await waitFor(() => {
      expect(scriptWriteMock).toHaveBeenCalledTimes(2)
    })

    const calls = scriptWriteMock.mock.calls
    const fileNames = calls.map((call) => call[1] as string)
    expect(fileNames).toContain('chapter1.gal')
    expect(fileNames).toContain('chapter2.gal')

    const chapter1Content = calls.find((call) => call[1] === 'chapter1.gal')?.[2] as string
    expect(chapter1Content).toContain('## 开场')
    expect(chapter1Content).toContain('* "开始旅程" -> 相遇')

    const chapter2Content = calls.find((call) => call[1] === 'chapter2.gal')?.[2] as string
    expect(chapter2Content).toContain('## 相遇')
    expect(chapter2Content).toContain('* "一个创作文字游戏的 IDE" -> 结局·真相')
  })

  it('records the sample project as recent after creation', async () => {
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByTestId('welcome-open-sample'))

    await waitFor(() => {
      expect(recordRecentMock).toHaveBeenCalledWith({
        path: '/mock/projects/Galide示例项目',
        name: 'Galide示例项目'
      })
    })
  })

  it('does nothing when sample project directory picker is canceled', async () => {
    chooseDirectoryMock.mockResolvedValue({ ok: true, canceled: true })
    render(<WelcomeScreen />)
    fireEvent.click(screen.getByTestId('welcome-open-sample'))

    await waitFor(() => {
      expect(createAtPathMock).not.toHaveBeenCalled()
    })
  })
})
