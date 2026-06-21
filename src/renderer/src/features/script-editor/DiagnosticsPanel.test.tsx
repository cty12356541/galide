import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiagnosticsPanel } from './DiagnosticsPanel'
import { useUiStore } from '../../lib/store'

const floatMock = vi.fn()

vi.mock('../../lib/hooks/use-panel-float', () => ({
  usePanelFloat: () => floatMock
}))

describe('DiagnosticsPanel', () => {
  beforeEach(() => {
    floatMock.mockClear()
    useUiStore.setState({ scriptEditorScrollTarget: null })
  })

  it('clicking a diagnostic opens script editor at line/column', () => {
    render(
      <DiagnosticsPanel
        items={[{ line: 5, column: 3, message: '语法错误', severity: 'error' }]}
      />
    )
    fireEvent.click(screen.getByTestId('diagnostic-item-5'))
    expect(floatMock).toHaveBeenCalledWith('script-editor')
    expect(useUiStore.getState().scriptEditorScrollTarget).toEqual({ line: 5, column: 3 })
  })
})
