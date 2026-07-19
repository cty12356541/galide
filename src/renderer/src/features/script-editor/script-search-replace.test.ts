import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import {
  search,
  searchKeymap,
  SearchQuery,
  setSearchQuery,
  openSearchPanel,
  closeSearchPanel,
  searchPanelOpen,
  replaceAll,
  replaceNext
} from '@codemirror/search'

const makeView = (doc: string): EditorView => {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({
    state: EditorState.create({
      doc,
      extensions: [search({ top: true }), keymap.of([...searchKeymap])]
    }),
    parent
  })
}

let view: EditorView | null = null

afterEach(() => {
  view?.destroy()
  view = null
  document.body.innerHTML = ''
})

describe('script editor regex find-and-replace', () => {
  it('replaceAll applies regex capture groups: foo(\\d+) → bar$1', () => {
    view = makeView('foo123 foo7')
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: 'foo(\\d+)', replace: 'bar$1', regexp: true })
      )
    })
    expect(replaceAll(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('bar123 bar7')
  })

  it('replaceNext replaces only the selected match', () => {
    view = makeView('foo123 foo7')
    view.dispatch({
      effects: setSearchQuery.of(
        new SearchQuery({ search: 'foo(\\d+)', replace: 'bar$1', regexp: true })
      ),
      selection: { anchor: 0, head: 6 }
    })
    expect(replaceNext(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('bar123 foo7')
  })

  it('replaceAll respects literal (non-regex) queries', () => {
    view = makeView('foo123 foo7')
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: 'foo', replace: 'bar' }))
    })
    expect(replaceAll(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('bar123 bar7')
  })

  it('openSearchPanel renders a replace input in the panel DOM', () => {
    view = makeView('foo123 foo7')
    expect(openSearchPanel(view)).toBe(true)
    expect(searchPanelOpen(view.state)).toBe(true)
    const panel = view.dom.querySelector('.cm-panel.cm-search')
    expect(panel).not.toBeNull()
    const replaceInput = panel?.querySelector<HTMLInputElement>('input[name="replace"]')
    expect(replaceInput).not.toBeNull()
    const buttons = Array.from(panel?.querySelectorAll('button') ?? []).map((b) =>
      b.textContent?.toLowerCase()
    )
    expect(buttons).toContain('replace')
    expect(buttons).toContain('all')
    closeSearchPanel(view)
    expect(searchPanelOpen(view.state)).toBe(false)
  })
})
