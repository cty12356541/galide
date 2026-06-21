import type { ParseError } from '../../../../shared/dsl/types'

export interface EditorScrollTarget {
  line: number
  column: number
}

/** Map a parse diagnostic to a CodeMirror scroll target (1-based line/column). */
export const diagnosticToScrollTarget = (item: Pick<ParseError, 'line' | 'column'>): EditorScrollTarget => ({
  line: Math.max(1, item.line),
  column: Math.max(1, item.column)
})

/** Compute document offset for a 1-based line/column in LF-normalized source. */
export const toDocOffset = (source: string, target: EditorScrollTarget): number => {
  const lines = source.split('\n')
  const lineIdx = Math.max(0, Math.min(target.line - 1, lines.length - 1))
  let offset = 0
  for (let i = 0; i < lineIdx; i++) {
    offset += (lines[i]?.length ?? 0) + 1
  }
  const lineLen = lines[lineIdx]?.length ?? 0
  const col = Math.max(0, Math.min(target.column - 1, lineLen))
  return offset + col
}
