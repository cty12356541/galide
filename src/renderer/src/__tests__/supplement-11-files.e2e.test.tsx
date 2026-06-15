/**
 * supplement-11-files e2e mount test
 *
 * 验证 11 个新增文件(以及 SidePanel 的 3 个 panel 子组件)能被 import + mount + 渲染。
 * 这是产线"按 9 commit 设计意图补全"的最低 e2e 验证:
 *  - 每个新组件能 React mount 不 throw
 *  - DOM 中能找到关键 testid / 文本节点,证明 layout 真在工作
 *  - workspace-layout 默认值与合并行为符合规约
 *
 * 这是 in-flight 周期的回归基线,后续 PR 应在此基础上扩展真实的:
 *  - 拖拽 / 多区域切换行为
 *  - dockview 多 group 布局
 *  - 主进程 IPC handler 端到端(此处的 mount 测试只覆盖 renderer 端)
 *
 * 文件位置:src/renderer/src/__tests__/supplement-11-files.e2e.test.tsx
 * 选这个位置是因为 __tests__ 是 vitest 默认 include 的目录,
 * 而且相对路径从 renderer/src 算起最直接(lib/store 在同层)。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useUiStore } from '../lib/store'

// 任何 window.galide 访问都返回 null(测试不依赖 preload)
const setGalideEmpty = (): void => {
  ;(window as unknown as { galide: undefined }).galide = undefined
}

beforeEach(() => {
  cleanup()
  setGalideEmpty()
  // 重置 store 到默认状态(测试间隔离)
  useUiStore.setState({
    projectPath: null,
    projectName: null,
    manifest: null,
    activeScriptFile: 'chapter1.gal',
    workspaceLayout: {
      activeActivity: [],
      openCenterTabs: ['editor'],
      rightDock: null,
      preset: 'writing',
      schemaVersion: 1
    },
    aiPanelOpen: false
  })
})

describe('supplement-11-files: shared types + utilities', () => {
  it('applyWorkspacePreset(writing) sets expected layout', async () => {
    const { applyWorkspacePreset, DEFAULT_WORKSPACE_LAYOUT } = await import(
      '../../../shared/workspace-layout'
    )
    const next = applyWorkspacePreset(DEFAULT_WORKSPACE_LAYOUT, 'writing')
    expect(next.activeActivity).toEqual(['scripts', 'characters'])
    expect(next.openCenterTabs).toEqual(['editor', 'outline'])
    expect(next.rightDock).toBeNull()
    expect(next.preset).toBe('writing')
  })

  it('applyWorkspacePreset(flow) opens AI right dock', async () => {
    const { applyWorkspacePreset } = await import('../../../shared/workspace-layout')
    const next = applyWorkspacePreset(
      {
        activeActivity: [],
        openCenterTabs: ['editor'],
        rightDock: null,
        preset: 'writing',
        schemaVersion: 1
      },
      'flow'
    )
    expect(next.rightDock).toBe('ai')
    expect(next.activeActivity).toEqual(['scripts', 'outline'])
    expect(next.openCenterTabs).toEqual(['flow', 'editor'])
  })

  it('applyWorkspacePreset(review) opens AI + git panel', async () => {
    const { applyWorkspacePreset } = await import('../../../shared/workspace-layout')
    const next = applyWorkspacePreset(
      {
        activeActivity: [],
        openCenterTabs: ['editor'],
        rightDock: null,
        preset: 'writing',
        schemaVersion: 1
      },
      'review'
    )
    expect(next.rightDock).toBe('ai')
    expect(next.activeActivity).toContain('git')
    expect(next.openCenterTabs).toContain('preview')
  })

  it('mergeWorkspaceLayout with null returns fallback copy', async () => {
    const { mergeWorkspaceLayout, DEFAULT_WORKSPACE_LAYOUT } = await import(
      '../../../shared/workspace-layout'
    )
    const merged = mergeWorkspaceLayout(null, DEFAULT_WORKSPACE_LAYOUT)
    expect(merged).toEqual(DEFAULT_WORKSPACE_LAYOUT)
    // 不应是 fallback 的同一引用(必须返回副本,避免外部修改污染默认值)
    expect(merged).not.toBe(DEFAULT_WORKSPACE_LAYOUT)
  })

  it('mergeWorkspaceLayout filters unknown activity ids', async () => {
    const { mergeWorkspaceLayout } = await import('../../../shared/workspace-layout')
    const merged = mergeWorkspaceLayout(
      {
        activeActivity: ['scripts', 'bogus-id' as never, 'characters'],
        openCenterTabs: ['editor'],
        rightDock: null,
        preset: 'writing',
        schemaVersion: 1
      },
      {
        activeActivity: [],
        openCenterTabs: [],
        rightDock: null,
        preset: 'writing',
        schemaVersion: 1
      }
    )
    expect(merged.activeActivity).toEqual(['scripts', 'characters'])
  })

  it('mergeWorkspaceLayout coerces invalid rightDock to fallback', async () => {
    const { mergeWorkspaceLayout } = await import('../../../shared/workspace-layout')
    const merged = mergeWorkspaceLayout(
      {
        rightDock: 'something-else' as never
      },
      {
        activeActivity: [],
        openCenterTabs: [],
        rightDock: 'ai',
        preset: 'writing',
        schemaVersion: 1
      }
    )
    expect(merged.rightDock).toBe('ai')
  })
})

describe('supplement-11-files: ActivityBar mount + toggle', () => {
  it('renders 6 buttons and toggling stores activeActivity', async () => {
    const { ActivityBar } = await import('../components/workspace/ActivityBar')
    render(<ActivityBar />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBe(6)
    expect(useUiStore.getState().workspaceLayout.activeActivity).toEqual([])

    fireEvent.click(screen.getByTestId('activity-scripts'))
    expect(useUiStore.getState().workspaceLayout.activeActivity).toEqual(['scripts'])

    fireEvent.click(screen.getByTestId('activity-characters'))
    expect(useUiStore.getState().workspaceLayout.activeActivity).toEqual([
      'scripts',
      'characters'
    ])

    // 再次点击 scripts 移除(multi-split toggle)
    fireEvent.click(screen.getByTestId('activity-scripts'))
    expect(useUiStore.getState().workspaceLayout.activeActivity).toEqual(['characters'])
  })
})

describe('supplement-11-files: SidePanel multi-split', () => {
  it('empty activeActivity renders w-0 placeholder', async () => {
    const { SidePanel } = await import('../components/workspace/SidePanel')
    const { container } = render(<SidePanel />)
    expect(container.querySelector('[data-testid="side-panel-empty"]')).toBeTruthy()
    expect(screen.queryByTestId('side-panel')).toBeNull()
  })

  it('single activity renders 1 child panel', async () => {
    useUiStore.setState((s) => ({
      workspaceLayout: {
        ...s.workspaceLayout,
        activeActivity: ['scripts']
      }
    }))
    const { SidePanel } = await import('../components/workspace/SidePanel')
    render(<SidePanel />)
    expect(screen.getByTestId('side-panel')).toBeTruthy()
    expect(screen.getByTestId('side-panel-scripts')).toBeTruthy()
  })

  it('multiple activities render in order', async () => {
    useUiStore.setState((s) => ({
      workspaceLayout: {
        ...s.workspaceLayout,
        activeActivity: ['scripts', 'characters', 'voice']
      }
    }))
    const { SidePanel } = await import('../components/workspace/SidePanel')
    const { container } = render(<SidePanel />)
    const panels = container.querySelectorAll('[data-testid^="side-panel-"]')
    // 3 个 panel + 0 个 side-panel-empty
    const ids = Array.from(panels).map((p) => p.getAttribute('data-testid'))
    expect(ids).toContain('side-panel-scripts')
    expect(ids).toContain('side-panel-characters')
    expect(ids).toContain('side-panel-voice')
  })
})

describe('supplement-11-files: StatusBarWorkspaceIndicator', () => {
  it('shows preset name + panels count + dock state', async () => {
    useUiStore.setState((s) => ({
      workspaceLayout: {
        ...s.workspaceLayout,
        activeActivity: ['scripts', 'characters'],
        rightDock: 'ai',
        preset: 'flow'
      }
    }))
    const { StatusBarWorkspaceIndicator } = await import(
      '../components/workspace/StatusBarWorkspaceIndicator'
    )
    render(<StatusBarWorkspaceIndicator />)
    const el = screen.getByTestId('statusbar-workspace-indicator')
    expect(el.textContent).toContain('流程')
    expect(el.textContent).toContain('2 panels')
    expect(el.textContent).toContain('AI on')
  })
})

describe('supplement-11-files: WorkspacePresetSelector', () => {
  it('renders 3 preset buttons and clicking applies', async () => {
    const { WorkspacePresetSelector } = await import(
      '../components/workspace/WorkspacePresetSelector'
    )
    render(<WorkspacePresetSelector />)
    expect(screen.getByTestId('preset-writing')).toBeTruthy()
    expect(screen.getByTestId('preset-flow')).toBeTruthy()
    expect(screen.getByTestId('preset-review')).toBeTruthy()

    fireEvent.click(screen.getByTestId('preset-review'))
    expect(useUiStore.getState().workspaceLayout.preset).toBe('review')
    expect(useUiStore.getState().workspaceLayout.rightDock).toBe('ai')

    fireEvent.click(screen.getByTestId('preset-writing'))
    expect(useUiStore.getState().workspaceLayout.preset).toBe('writing')
    expect(useUiStore.getState().workspaceLayout.rightDock).toBeNull()
  })
})

describe('supplement-11-files: OutlinePanel', () => {
  it('shows empty state when manifest is null', async () => {
    const { OutlinePanel } = await import('../features/outline/OutlinePanel')
    render(<OutlinePanel />)
    expect(screen.getByTestId('outline-panel')).toBeTruthy()
    expect(screen.getByText(/打开项目以查看大纲/)).toBeTruthy()
  })

  it('shows characters from manifest when present', async () => {
    useUiStore.setState({
      projectName: '测试项目',
      manifest: {
        version: '0.1.0',
        name: '测试项目',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        characters: [
          {
            id: 'char1',
            name: '小雪',
            description: '校园女主',
            personality: '温柔',
            spriteSet: []
          }
        ],
        assets: {
          characters: 'assets/characters',
          backgrounds: 'assets/backgrounds',
          bgm: 'assets/bgm'
        }
      },
      activeScriptFile: 'chapter1.gal'
    })
    const { OutlinePanel } = await import('../features/outline/OutlinePanel')
    render(<OutlinePanel />)
    expect(screen.getByText('小雪')).toBeTruthy()
  })
})

describe('supplement-11-files: useWorkspacePersistence safe wrapper', () => {
  it('returns null hydrate when window.galide is missing', async () => {
    setGalideEmpty()
    const { useWorkspacePersistence } = await import('../lib/ipc/use-workspace')
    const { result } = renderHook(() => useWorkspacePersistence())
    const layout = await result.current.hydrate('/p')
    expect(layout).toBeNull()
    // persistGlobal/persistProject 应静默 no-op,不 throw
    await result.current.persistGlobal({
      activeActivity: [],
      openCenterTabs: [],
      rightDock: null,
      preset: 'writing',
      schemaVersion: 1
    })
    await result.current.persistProject('/p', {
      activeActivity: [],
      openCenterTabs: [],
      rightDock: null,
      preset: 'writing',
      schemaVersion: 1
    })
  })

  it('calls preload workspace methods when available', async () => {
    const readGlobal = vi.fn(() =>
      Promise.resolve({ ok: true, layout: { preset: 'flow' } as never })
    )
    const writeProject = vi.fn(() => Promise.resolve({ ok: true }))
    const writeGlobal = vi.fn(() => Promise.resolve({ ok: true }))
    const readProject = vi.fn(() => Promise.resolve({ ok: true, layout: null }))
    ;(window as unknown as { galide: unknown }).galide = {
      workspace: { readProject, writeProject, readGlobal, writeGlobal }
    }

    const { useWorkspacePersistence } = await import('../lib/ipc/use-workspace')
    const { result } = renderHook(() => useWorkspacePersistence())

    const layout = await result.current.hydrate('/p')
    expect(layout).toBeNull() // readProject returned null layout
    expect(readProject).toHaveBeenCalledWith('/p')

    const layout2 = await result.current.hydrate(null)
    expect(layout2).toEqual({ preset: 'flow' }) // falls back to global

    await result.current.persistProject('/p', {
      activeActivity: [],
      openCenterTabs: [],
      rightDock: null,
      preset: 'writing',
      schemaVersion: 1
    })
    expect(writeProject).toHaveBeenCalled()

    await result.current.persistGlobal({
      activeActivity: [],
      openCenterTabs: [],
      rightDock: null,
      preset: 'writing',
      schemaVersion: 1
    })
    expect(writeGlobal).toHaveBeenCalled()
  })
})

describe('supplement-11-files: useAppearanceEffect', () => {
  it('toggles dark class on document.documentElement', async () => {
    const { useAppearanceEffect } = await import('../lib/ipc/use-appearance-effect')

    // start light
    useUiStore.setState({ theme: 'light' })
    const { rerender } = renderHook(() => useAppearanceEffect())
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // switch to dark — rerender to pick up new theme
    useUiStore.setState({ theme: 'dark' })
    rerender()
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true))

    // back to light
    useUiStore.setState({ theme: 'light' })
    rerender()
    await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(false))
  })
})

describe('supplement-11-files: AssetListPanel', () => {
  it('shows empty state when project is null', async () => {
    const { AssetListPanel } = await import('../features/asset/AssetListPanel')
    render(<AssetListPanel />)
    expect(screen.getByText(/请先打开项目/)).toBeTruthy()
  })

  it('renders tabs and toggles kind', async () => {
    useUiStore.setState({ projectPath: '/fake' })
    const list = vi.fn((_p: string, kind: string) =>
      Promise.resolve({ ok: true, entries: [{ relPath: `assets/${kind}/a.png`, kind, size: 1024 }] })
    )
    ;(window as unknown as { galide: unknown }).galide = { asset: { list } }
    const { AssetListPanel } = await import('../features/asset/AssetListPanel')
    render(<AssetListPanel />)
    // 默认 kind='characters',列表中应有 a.png
    await waitFor(() => expect(screen.getByText('a.png')).toBeTruthy())
    // 切换到 bgm
    fireEvent.click(screen.getByText('BGM'))
    await waitFor(() => expect(list).toHaveBeenCalledWith('/fake', 'bgm'))
  })
})

describe('supplement-11-files: GitPanel', () => {
  it('shows git-not-initialized state when status is empty', async () => {
    useUiStore.setState({ projectPath: '/fake' })
    // useGitStatus 内部走 window.galide.git.status — 测试中未注入,降级到 null
    const { GitPanel } = await import('../features/git/GitPanel')
    render(<GitPanel />)
    expect(screen.getByText(/项目尚未初始化 Git 仓库/)).toBeTruthy()
  })
})