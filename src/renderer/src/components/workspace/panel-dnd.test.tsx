/**
 * panel-dnd 测试(Phase 3 T3-1 + T3-2)
 *
 * 覆盖:
 * - 原生 HTML5 拖拽 SideToolWindow header 到另一 dock → panelStates 更新 + localStorage 持久化 + 视觉反馈
 * - DockedLocationMenu 菜单通道与拖拽通道语义完全一致(双通道可用)
 * - 非法 drop 拦截:editor 文档面板拖到 tool dock 被拒并显示禁止标识
 * - 反向非法 drop 拦截:tool window 拖到 editor-core 被拒并显示禁止标识
 * - 浮出上限(MAX_FLOATING_PANELS = 5)在拖拽与按钮浮出两条路径一致生效
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SideToolWindow } from './SideToolWindow'
import { DockDropOverlay } from './DockDropOverlay'
import { PanelHeader } from '../ui/panel-header'
import {
  PANEL_DND_MIME,
  evaluatePanelDrop,
  panelDndStore
} from './panel-dnd'
import { MAX_FLOATING_PANELS } from './panels/panel-registry'
import { useUiStore, useErrorStore } from '../../lib/store'
import { WORKSPACE_PRESET_DEFAULTS } from '../../lib/workspace-presets'
import {
  WORKSPACE_LAYOUT_KEY,
  useWorkspacePersistence
} from '../../lib/hooks/use-workspace-persistence'

vi.mock('@renderer/features/script-editor/ScriptFileTree', () => ({
  ScriptFileTree: () => <div data-testid="scripts-stub" />
}))
vi.mock('@renderer/features/asset/AssetListPanel', () => ({
  AssetListPanel: () => <div data-testid="assets-stub" />
}))
vi.mock('@renderer/features/git/GitPanel', () => ({
  GitPanel: () => <div data-testid="git-stub" />
}))

const createMockDataTransfer = () => {
  const store = new Map<string, string>()
  return {
    dropEffect: 'none' as DataTransfer['dropEffect'],
    effectAllowed: 'all' as DataTransfer['effectAllowed'],
    setData: (type: string, val: string) => {
      store.set(type, val)
    },
    getData: (type: string) => store.get(type) ?? ''
  }
}

const dispatchDrag = (
  type: 'dragstart' | 'dragover' | 'dragleave' | 'drop' | 'dragend',
  el: Element,
  dt: ReturnType<typeof createMockDataTransfer>
): void => {
  const evt = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(evt, 'dataTransfer', { value: dt })
  fireEvent(el, evt)
}

const PersistenceHarness = (): JSX.Element => {
  useWorkspacePersistence()
  return (
    <div>
      <SideToolWindow toolWindowId="git" />
      <PanelHeader title="剧情决策树" draggablePanelId="flow-view" />
      <DockDropOverlay />
    </div>
  )
}

describe('Phase 3 HTML5 Panel Drag-and-Drop Docking', () => {
  let storageMap: Map<string, string>
  let openPanelMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    storageMap = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k: string) => storageMap.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storageMap.set(k, v)
        },
        removeItem: (k: string) => {
          storageMap.delete(k)
        },
        clear: () => {
          storageMap.clear()
        }
      },
      configurable: true
    })

    openPanelMock = vi.fn(async () => ({ ok: true as const, windowId: 42 }))
    ;(window as unknown as { galide: Record<string, unknown> }).galide = {
      workspace: {
        openPanel: openPanelMock,
        closePanel: vi.fn(async () => ({ ok: true }))
      }
    }

    useErrorStore.getState().clear()
    panelDndStore.setState({
      draggingPanelId: null,
      hoveredZone: null,
      rejectedFeedback: null
    })
    useUiStore.setState({
      workspacePreset: 'writing',
      panelStates: {
        ...WORKSPACE_PRESET_DEFAULTS.writing.panelStates,
        git: { dock: 'left', visible: true, activeSub: 'git' }
      },
      floatingPanels: []
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('drags tool window header to bottom dock, shows visual highlight, updates panelStates, and persists layout', () => {
    render(<PersistenceHarness />)

    const gitHeader = screen.getByTestId('side-header-git')
    const dt = createMockDataTransfer()

    dispatchDrag('dragstart', gitHeader, dt)
    expect(dt.getData(PANEL_DND_MIME)).toBe('git')

    const bottomZone = screen.getByTestId('dock-drop-bottom')
    dispatchDrag('dragover', bottomZone, dt)
    expect(dt.dropEffect).toBe('move')
    expect(bottomZone.getAttribute('data-drop-state')).toBe('allowed')

    dispatchDrag('drop', bottomZone, dt)
    expect(useUiStore.getState().panelStates.git.dock).toBe('bottom')
    expect(useUiStore.getState().panelStates.git.visible).toBe(true)
    expect(useUiStore.getState().visiblePerSide.bottom).toBe('git')

    // Flush 300ms persistence debounce
    act(() => {
      vi.advanceTimersByTime(350)
    })
    const persisted = JSON.parse(storageMap.get(WORKSPACE_LAYOUT_KEY) ?? '{}') as {
      panelStates?: { git?: { dock: string; visible: boolean } }
    }
    expect(persisted.panelStates?.git).toMatchObject({ dock: 'bottom', visible: true })
  })

  it('preserves DockedLocationMenu channel with identical state semantics', () => {
    render(<PersistenceHarness />)

    fireEvent.click(screen.getByTestId('dock-menu-git'))
    fireEvent.click(screen.getByText('右侧'))

    expect(useUiStore.getState().panelStates.git.dock).toBe('right')
    expect(useUiStore.getState().visiblePerSide.right).toBe('git')
  })

  it('rejects dragging editor document header onto tool dock with forbidden visual indicator', () => {
    render(<PersistenceHarness />)
    const beforeStates = structuredClone(useUiStore.getState().panelStates)

    const flowHeader = screen.getByTestId('panel-header-剧情决策树')
    const dt = createMockDataTransfer()
    dt.dropEffect = 'move'

    dispatchDrag('dragstart', flowHeader, dt)
    const leftZone = screen.getByTestId('dock-drop-left')
    expect(leftZone.getAttribute('data-drop-state')).toBe('forbidden')

    dispatchDrag('dragover', leftZone, dt)
    expect(dt.dropEffect).toBe('none')

    dispatchDrag('drop', leftZone, dt)
    expect(useUiStore.getState().panelStates).toEqual(beforeStates)
    expect(screen.getByTestId('dock-drop-rejected-banner').textContent).toContain(
      '编辑器文档面板不能停靠到工具栏槽位'
    )
  })

  it('rejects reverse illegal drop: dragging tool window onto editor-core continent', () => {
    render(<PersistenceHarness />)
    const beforeStates = structuredClone(useUiStore.getState().panelStates)

    const gitHeader = screen.getByTestId('side-header-git')
    const dt = createMockDataTransfer()
    dt.dropEffect = 'move'

    dispatchDrag('dragstart', gitHeader, dt)
    const editorZone = screen.getByTestId('dock-drop-editor-core')

    dispatchDrag('dragover', editorZone, dt)
    expect(dt.dropEffect).toBe('none')
    expect(editorZone.getAttribute('data-drop-state')).toBe('forbidden')

    dispatchDrag('drop', editorZone, dt)
    expect(useUiStore.getState().panelStates).toEqual(beforeStates)
    expect(screen.getByTestId('dock-drop-rejected-banner').textContent).toContain(
      '工具窗不能停靠至编辑器核心区'
    )
  })

  it('enforces MAX_FLOATING_PANELS consistently across both DnD float drop and float button', () => {
    const maxedFloating = ['project', 'outline', 'character', 'ai', 'brain']
    expect(maxedFloating).toHaveLength(MAX_FLOATING_PANELS)
    useUiStore.setState({ floatingPanels: maxedFloating })

    expect(evaluatePanelDrop('git', 'floating', maxedFloating)).toEqual({
      allowed: false,
      reason: `已达最大浮出上限(${MAX_FLOATING_PANELS})`
    })

    render(<PersistenceHarness />)
    const gitHeader = screen.getByTestId('side-header-git')
    const dt = createMockDataTransfer()

    dispatchDrag('dragstart', gitHeader, dt)
    const floatZone = screen.getByTestId('dock-drop-floating')
    expect(floatZone.getAttribute('data-drop-state')).toBe('forbidden')

    dispatchDrag('drop', floatZone, dt)
    expect(useUiStore.getState().floatingPanels).toEqual(maxedFloating)
    expect(openPanelMock).not.toHaveBeenCalled()

    // Direct float button click also respects the exact same limit
    fireEvent.click(screen.getByTestId('side-float-git'))
    expect(useUiStore.getState().floatingPanels).toEqual(maxedFloating)
    expect(openPanelMock).not.toHaveBeenCalled()
    expect(useErrorStore.getState().entries[0]?.code).toBe('PANEL_FLOAT_LIMIT')
  })
})
