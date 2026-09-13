/**
 * gal DSL CodeMirror 6 集成层
 *
 * 把 src/shared/dsl/lezer-parser.ts 暴露的 StreamParser 包装成
 * @codemirror/language 的 StreamLanguage + LanguageSupport,
 * 让 ScriptEditor 可以作为 CodeMirror extension 直接挂载。
 *
 * 历史:
 *   旧版基于 `@lezer/generator` 的 LRParser。`@lezer/generator` 在
 *   内部用 `import.meta.url` 启动 worker,Vite 在 renderer dep
 *   optimization 阶段把它当 ESM 解析会爆 `Unexpected token '"]"'`。
 *   现改用 `@codemirror/language` 的内置 `StreamLanguage`,无 LR
 *   解析器,无运行时编译,稳。
 */

import { autocompletion, type Completion, type CompletionSource } from '@codemirror/autocomplete'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import { LanguageSupport, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import type { Extension, Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { galParser, galHighlightStyle, type GalStreamState } from '../../../../shared/dsl/lezer-parser'
import type { ParseError } from '../../../../shared/dsl/types'
import type { ScriptNode } from '../../../../shared/dsl/types'
import { useUiStore } from '../../lib/store'

const galStreamLanguage = StreamLanguage.define<GalStreamState>(galParser)

const GAL_KEYWORDS = ['scene', 'dialogue', 'choice', 'goto', 'set', 'if', 'marker', 'chapter']

const keywordCompletions: Completion[] = GAL_KEYWORDS.map((k) => ({ label: k, type: 'keyword' }))

const collectSceneIds = (ast: ScriptNode | null): string[] => {
  if (!ast) return []
  return ast.children
    .filter((n): n is Extract<typeof n, { type: 'scene' }> => n.type === 'scene')
    .map((n) => n.id)
}

const getStoreSceneIds = (): string[] => collectSceneIds(useUiStore.getState().projectMergedAst)

const getStoreCharacters = (): string[] =>
  useUiStore.getState().manifest?.characters.map((c) => c.name) ?? []

export interface GalAutocompleteOptions {
  getSceneIds?: () => string[]
  getCharacters?: () => string[]
}

export const createGalCompletionSource = (options?: GalAutocompleteOptions): CompletionSource => {
  const getSceneIds = options?.getSceneIds ?? getStoreSceneIds
  const getCharacters = options?.getCharacters ?? getStoreCharacters

  return (ctx) => {
    const line = ctx.state.doc.lineAt(ctx.pos)
    const textBefore = line.text.slice(0, ctx.pos - line.from)
    const column = ctx.pos - line.from

    if (line.text.startsWith('## ')) {
      const prefix = line.text.slice(3)
      return {
        from: line.from + 3,
        options: getSceneIds()
          .filter((id) => id.startsWith(prefix))
          .map((id) => ({ label: id, type: 'constant' })),
        validFor: /^\S*$/
      }
    }

    const dialogueMatch = /^([^:\[]+):/.exec(line.text)
    if (dialogueMatch && dialogueMatch[1] !== undefined && column <= dialogueMatch[1].length) {
      return {
        from: line.from,
        options: getCharacters()
          .filter((name) => name.startsWith(textBefore))
          .map((name) => ({ label: name, type: 'variable' })),
        validFor: /^[^:]*$/
      }
    }

    const word = ctx.matchBefore(/\w+/)
    if (word && word.from === line.from) {
      return {
        from: word.from,
        options: keywordCompletions.filter((k) => k.label.startsWith(word.text)),
        validFor: /^\w*$/
      }
    }
    if (!word && /^\s*$/.test(textBefore)) {
      return {
        from: ctx.pos,
        options: keywordCompletions,
        validFor: /^\w*$/
      }
    }

    return null
  }
}

export const galAutocomplete = (options?: GalAutocompleteOptions): Extension =>
  autocompletion({ override: [createGalCompletionSource(options)] })

const parseErrorToDiagnostic = (doc: Text, error: ParseError): Diagnostic => {
  const lineNumber = Math.min(Math.max(1, error.line), doc.lines)
  const line = doc.line(lineNumber)
  const col = Math.min(Math.max(1, error.column), line.length + 1)
  const from = line.from + col - 1
  const to = from < line.to ? from + 1 : from
  return {
    from,
    to,
    message: error.message,
    severity: error.severity ?? 'error'
  }
}

export const setGalDiagnostics = (view: EditorView, diagnostics: ParseError[]): void => {
  view.dispatch(setDiagnostics(view.state, diagnostics.map((d) => parseErrorToDiagnostic(view.state.doc, d))))
}

export const galDiagnostics = (): Extension => lintGutter()

/**
 * CodeMirror extension,直接放到 EditorState.create({extensions: [...]}) 里。
 * 自动附带 syntaxHighlighting(galHighlightStyle)。
 */
export const galLanguage = (): LanguageSupport =>
  new LanguageSupport(galStreamLanguage, [syntaxHighlighting(galHighlightStyle)])

/** Re-export highlight style for advanced use cases (e.g. theme override). */
export { galHighlightStyle }
