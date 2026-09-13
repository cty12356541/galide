/**
 * MenuBar 测试(命令注册表驱动)
 *
 * 覆盖:
 *   - 菜单组 = CATEGORY_ORDER 顺序的注册表分类 + 非注册表帮助组
 *   - 每组菜单项与 COMMANDS(按 category 过滤)完全一致:label/icon/快捷键标签
 *   - requiresProject 项在无项目时隐藏
 *   - 用户重绑快捷键后菜单显示重绑标签(经 ui-store resolvedShortcuts,
 *     与 useResolvedShortcutsSync 灌入的偏好解析结果同源)
 *   - 点击菜单项经 dispatchCommand(id) 投递
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MenuBar } from './MenuBar'
import { useUiStore } from '../lib/store'
import { WORKSPACE_PRESET_DEFAULTS } from '../lib/workspace-presets'
import {
  COMMANDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  acceleratorLabel,
  effectiveShortcut,
  type CommandCategory
} from '../lib/command-registry'
import { dispatchCommand } from '../lib/command-dispatcher'

vi.mock('../lib/command-dispatcher', () => ({
  dispatchCommand: vi.fn(() => Promise.resolve({ ok: true })),
  registerCommandHandlers: vi.fn(),
  registerCommandHandler: vi.fn(),
  isKnownCommandId: () => true
}))

const dispatchMock = vi.mocked(dispatchCommand)

const expectedItems = (category: CommandCategory, hasProject: boolean) =>
  COMMANDS.filter((cmd) => cmd.category === category && (!cmd.requiresProject || hasProject))

beforeEach(() => {
  vi.clearAllMocks()
  useUiStore.setState({
    projectPath: '/tmp/proj',
    workspacePreset: 'writing',
    panelStates: { ...WORKSPACE_PRESET_DEFAULTS.writing.panelStates },
    resolvedShortcuts: {}
  })
})

describe('MenuBar(注册表驱动)', () => {
  it('菜单组按 CATEGORY_ORDER 渲染 + 末尾帮助组', () => {
    render(<MenuBar />)
    const nav = screen.getByTestId('menu-bar')
    const triggers = Array.from(nav.querySelectorAll('button[data-testid^="menu-"]'))
    const keys = triggers.map((el) => el.getAttribute('data-testid'))
    expect(keys).toEqual([...CATEGORY_ORDER.map((c) => `menu-${c}`), 'menu-help'])
    for (const category of CATEGORY_ORDER) {
      expect(screen.getByTestId(`menu-${category}`).textContent).toContain(
        CATEGORY_LABELS[category]
      )
    }
  })

  it.each(CATEGORY_ORDER.map((c) => [c] as const))(
    '菜单项与注册表 %s 分类完全一致(label + 快捷键标签)',
    (category) => {
      render(<MenuBar />)
      fireEvent.click(screen.getByTestId(`menu-${category}`))
      const expected = expectedItems(category, true)
      for (const cmd of expected) {
        const item = screen.getByTestId(`menu-item-${category}-${cmd.id}`)
        expect(item.textContent).toContain(cmd.label)
        const hint = acceleratorLabel(effectiveShortcut(cmd.id, undefined))
        if (hint) {
          expect(item.textContent).toContain(hint)
        }
      }
      // 数量一致:渲染项集合 = 注册表派生集合
      const rendered = document.querySelectorAll(`[data-testid^="menu-item-${category}-"]`)
      expect(rendered.length).toBe(expected.length)
    }
  )

  it('requiresProject 项在无项目时隐藏,有项目时显示', () => {
    useUiStore.setState({ projectPath: null })
    const { unmount } = render(<MenuBar />)
    fireEvent.click(screen.getByTestId('menu-project'))
    expect(screen.queryByTestId('menu-item-project-closeProject')).toBeNull()
    unmount()

    useUiStore.setState({ projectPath: '/tmp/proj' })
    render(<MenuBar />)
    fireEvent.click(screen.getByTestId('menu-project'))
    expect(screen.getByTestId('menu-item-project-closeProject')).toBeTruthy()
  })

  it('用户重绑快捷键后显示重绑标签', () => {
    useUiStore.setState({ resolvedShortcuts: { newScriptFile: 'Ctrl+Alt+N' } })
    render(<MenuBar />)
    fireEvent.click(screen.getByTestId('menu-file'))
    const item = screen.getByTestId('menu-item-file-newScriptFile')
    expect(item.textContent).toContain(acceleratorLabel('Ctrl+Alt+N'))
    expect(item.textContent).not.toContain(acceleratorLabel('Meta+N') ?? '')
  })

  it('点击菜单项经 dispatchCommand 投递正确命令 id', () => {
    render(<MenuBar />)
    fireEvent.click(screen.getByTestId('menu-file'))
    fireEvent.click(screen.getByTestId('menu-item-file-newScriptFile'))
    expect(dispatchMock).toHaveBeenCalledWith('newScriptFile')
  })

  it('帮助组保留「关于 Galide」外部链接项(非注册表命令)', () => {
    render(<MenuBar />)
    fireEvent.click(screen.getByTestId('menu-help'))
    expect(screen.getByTestId('menu-item-help-about').textContent).toContain('关于 Galide')
  })
})
