import { describe, it, expect, beforeEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { diagnosticCount } from '@codemirror/lint'
import { EditorView } from '@codemirror/view'
import { createGalCompletionSource, setGalDiagnostics } from './gal-language'
import { useUiStore } from '../../lib/store'
import type { ScriptNode, ParseError } from '../../../../shared/dsl/types'
import type { CharacterCard } from '../../../../shared/types'

const makeAst = (sceneIds: string[]): ScriptNode => ({
  type: 'script',
  line: 1,
  column: 1,
  children: sceneIds.map((id) => ({ type: 'scene', id, line: 1, column: 1, children: [] })),
  errors: []
})

const setStore = (sceneIds: string[], characterNames: string[]): void => {
  useUiStore.setState({
    projectMergedAst: makeAst(sceneIds),
    manifest: {
      version: '0.1.0',
      name: 'test',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      characters: characterNames.map(
        (name) =>
          ({
            id: name,
            name,
            description: '',
            personality: '',
            spriteSet: []
          }) satisfies CharacterCard
      ),
      assets: { characters: 'assets/characters', backgrounds: 'assets/backgrounds', bgm: 'assets/bgm' },
      git: { initialized: false }
    }
  })
}

describe('gal-language completion', () => {
  beforeEach(() => {
    setStore([], [])
  })

  it('suggests DSL keywords at line start', () => {
    const state = EditorState.create({ doc: 'sc' })
    const source = createGalCompletionSource()
    const result = source(new CompletionContext(state, 2, true)) as CompletionResult | null
    expect(result).not.toBeNull()
    const labels = result?.options.map((o) => o.label) ?? []
    expect(labels).toContain('scene')
  })

  it('suggests scene IDs after `## `', () => {
    setStore(['开场', '相遇'], [])
    const state = EditorState.create({ doc: '## ' })
    const source = createGalCompletionSource()
    const result = source(new CompletionContext(state, 3, true)) as CompletionResult | null
    expect(result).not.toBeNull()
    const labels = result?.options.map((o) => o.label) ?? []
    expect(labels).toContain('开场')
    expect(labels).toContain('相遇')
  })

  it('suggests character names before `:`', () => {
    setStore([], ['小雪', '悠真'])
    const state = EditorState.create({ doc: '小:' })
    const source = createGalCompletionSource()
    const result = source(new CompletionContext(state, 1, true)) as CompletionResult | null
    expect(result).not.toBeNull()
    const labels = result?.options.map((o) => o.label) ?? []
    expect(labels).toContain('小雪')
    expect(labels).not.toContain('悠真')
  })
})

describe('gal-language diagnostics', () => {
  it('sets lint diagnostics from parse errors', () => {
    const container = document.createElement('div')
    const view = new EditorView({
      state: EditorState.create({ doc: 'bad line' }),
      parent: container
    })
    const error: ParseError = {
      line: 1,
      column: 1,
      message: 'expected scene',
      severity: 'error'
    }
    setGalDiagnostics(view, [error])
    expect(diagnosticCount(view.state)).toBe(1)
  })
})
