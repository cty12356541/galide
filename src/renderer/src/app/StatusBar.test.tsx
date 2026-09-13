import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StatusBar } from './StatusBar'
import { useUiStore, useErrorStore } from '../lib/store'
import { WORKSPACE_PRESET_DEFAULTS } from '../lib/workspace-presets'

type AgentStatusListener = (evt: { taskId: string; status: string; error?: string }) => void

let agentStatusListener: AgentStatusListener | null = null

const emitAgentStatus = (status: string, error?: string): void => {
  agentStatusListener?.(error ? { taskId: 't1', status, error } : { taskId: 't1', status })
}

const wrap = (ui: ReactNode): ReactNode => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

describe('StatusBar', () => {
  beforeEach(() => {
    agentStatusListener = null
    useUiStore.setState({
      projectPath: '/proj',
      workspacePreset: 'writing',
      panelStates: { ...WORKSPACE_PRESET_DEFAULTS.writing.panelStates }
    })
    useErrorStore.setState({ entries: [] })
    ;(window as unknown as { galide: unknown }).galide = {
      git: {
        status: () =>
          Promise.resolve({ initialized: true, current: 'feature/x', files: [] })
      },
      ai: {
        agent: {
          onStatus: (cb: AgentStatusListener) => {
            agentStatusListener = cb
            return () => {
              agentStatusListener = null
            }
          }
        }
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

  it('AI status light shows idle by default', () => {
    render(wrap(<StatusBar />))
    expect(screen.getByTestId('status-ai').textContent).toContain('AI 空闲')
    expect(screen.getByTestId('status-ai-dot').className).toContain('bg-success')
  })

  it('AI status light shows running on agent running status', () => {
    render(wrap(<StatusBar />))
    act(() => emitAgentStatus('running'))
    expect(screen.getByTestId('status-ai').textContent).toContain('AI 运行中')
    expect(screen.getByTestId('status-ai-dot').className).toContain('bg-accent')
    expect(screen.getByTestId('status-ai-dot').className).toContain('animate-pulse')
  })

  it('AI status light shows error on agent error status', () => {
    render(wrap(<StatusBar />))
    act(() => emitAgentStatus('error', 'boom'))
    expect(screen.getByTestId('status-ai').textContent).toContain('AI 错误')
    expect(screen.getByTestId('status-ai-dot').className).toContain('bg-danger')
  })

  it('AI status light returns to idle after done', () => {
    render(wrap(<StatusBar />))
    act(() => emitAgentStatus('running'))
    act(() => emitAgentStatus('done'))
    expect(screen.getByTestId('status-ai').textContent).toContain('AI 空闲')
    expect(screen.getByTestId('status-ai-dot').className).toContain('bg-success')
  })

  it('AI status light is not derived from error counts', () => {
    useErrorStore.getState().push({
      code: 'IPC_ERROR',
      message: '无关错误',
      source: 'script:parse'
    })
    render(wrap(<StatusBar />))
    expect(screen.getByTestId('status-ai').textContent).toContain('AI 空闲')
    expect(screen.getByTestId('status-ai-dot').className).toContain('bg-success')
    expect(screen.getByTestId('status-ai-dot').className).not.toContain('bg-danger')
  })
})
