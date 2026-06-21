import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'
import { useUiStore, useErrorStore } from '../lib/store'

const wrap = (ui: ReactNode): ReactNode => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

describe('StatusBar', () => {
  beforeEach(() => {
    useUiStore.setState({
      projectPath: '/proj',
      workspacePreset: 'writing',
      dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' },
      visiblePerSide: { left: 'project', right: 'ai', bottom: null }
    })
    useErrorStore.setState({ entries: [] })
    ;(window as unknown as { galide: unknown }).galide = {
      git: {
        status: () =>
          Promise.resolve({ initialized: true, current: 'feature/x', files: [] })
      }
    }
  })

  it('shows real git branch from useGitStatus', async () => {
    render(wrap(<StatusBar />))
    await waitFor(() => {
      expect(screen.getByTestId('status-git-branch').textContent).toContain('feature/x')
    })
  })

  it('error popover lists entries with dismiss', async () => {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: '连接失败',
      source: 'ai:generate'
    })
    render(wrap(<StatusBar />))
    fireEvent.click(screen.getByTestId('status-errors'))
    expect(await screen.findByText('连接失败')).toBeTruthy()
    expect(screen.getByText('ai:generate')).toBeTruthy()
    const entry = useErrorStore.getState().entries[0]
    if (!entry) throw new Error('missing entry')
    fireEvent.click(screen.getByLabelText('关闭'))
    expect(useErrorStore.getState().entries.find((e) => e.id === entry.id)).toBeUndefined()
  })
})
