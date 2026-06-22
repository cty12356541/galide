import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUiStore } from '../store'

const setGalideScriptMock = (overrides: {
  parseProject?: ReturnType<typeof vi.fn>
  onChanged?: ReturnType<typeof vi.fn>
}): void => {
  const w = window as unknown as {
    galide: {
      script: {
        parseProject: ReturnType<typeof vi.fn>
        onChanged: ReturnType<typeof vi.fn>
      }
    }
  }
  w.galide = {
    script: {
      parseProject: overrides.parseProject ?? vi.fn().mockResolvedValue({ ok: true, mergedAst: null }),
      onChanged: overrides.onChanged ?? vi.fn(() => () => undefined)
    }
  }
}

describe('useProjectScriptAst', () => {
  beforeEach(() => {
    useUiStore.setState({ projectPath: null, projectMergedAst: null, projectParseError: null })
    vi.restoreAllMocks()
  })

  it('clears merged ast when projectPath is null', async () => {
    setGalideScriptMock({})
    const { useProjectScriptAst } = await import('./use-project-script-ast')
    renderHook(() => useProjectScriptAst())
    expect(useUiStore.getState().projectMergedAst).toBeNull()
  })

  it('refreshes on script.onChanged for matching project', async () => {
    useUiStore.setState({ projectPath: '/tmp/proj' })
    const parseProject = vi.fn().mockResolvedValue({
      ok: true,
      mergedAst: { type: 'script', line: 1, column: 1, children: [], errors: [] }
    })
    const listeners: Array<(e: { projectPath: string }) => void> = []
    setGalideScriptMock({
      parseProject,
      onChanged: vi.fn((cb) => {
        listeners.push(cb)
        return () => undefined
      })
    })

    const { useProjectScriptAst } = await import('./use-project-script-ast')
    renderHook(() => useProjectScriptAst())

    await waitFor(() => expect(parseProject).toHaveBeenCalledWith('/tmp/proj'))

    listeners[0]?.({ projectPath: '/tmp/proj' })
    await waitFor(() => expect(parseProject).toHaveBeenCalledTimes(2))
  })
})
