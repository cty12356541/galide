import { useCallback } from 'react'
import { useUiStore } from '../store'
import { usePanelFloat } from './use-panel-float'
import { diagnosticToScrollTarget } from '../../features/script-editor/script-editor-jump'
import type { ParseError } from '../../../../shared/dsl/types'

export const useScriptEditorJump = (): ((item: Pick<ParseError, 'line' | 'column'>) => void) => {
  const float = usePanelFloat()

  return useCallback(
    (item) => {
      useUiStore.getState().setScriptEditorScrollTarget(diagnosticToScrollTarget(item))
      float('script-editor')
    },
    [float]
  )
}
