/**
 * mosaic-store 单测
 *
 * 覆盖:
 *   - 首次 read → tree=null
 *   - write 后 read 拿回一致
 *   - 多次 write 覆盖前值
 *   - store 抛错时返 { ok: false, error }
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  _setMosaicStoreFactory,
  readMosaicTree,
  writeMosaicTree
} from './mosaic-store.js'

const makeFake = (initial: unknown = null) => {
  const data: { tree: unknown } = { tree: initial }
  const state: { failNextGet: boolean; failNextSet: boolean } = {
    failNextGet: false,
    failNextSet: false
  }
  return {
    data,
    state,
    get: (k: 'tree'): unknown => {
      if (state.failNextGet) {
        state.failNextGet = false
        throw new Error('mock get failure')
      }
      return data[k]
    },
    set: (k: 'tree', v: unknown): void => {
      if (state.failNextSet) {
        state.failNextSet = false
        throw new Error('mock set failure')
      }
      data[k] = v
    }
  }
}

describe('mosaic-store', () => {
  beforeEach(() => {
    _setMosaicStoreFactory(null)
  })

  it('首次 read 返 ok=true, tree=null', () => {
    _setMosaicStoreFactory(() => makeFake(null))
    const r = readMosaicTree()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tree).toBeNull()
  })

  it('write 后 read 拿回一致', () => {
    const fake = makeFake(null)
    _setMosaicStoreFactory(() => fake)
    const tree = { direction: 'row' as const, first: 'script-editor' as const, second: 'flow-view' as const }
    const w = writeMosaicTree(tree)
    expect(w.ok).toBe(true)
    const r = readMosaicTree()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tree).toEqual(tree)
  })

  it('多次 write 覆盖前值', () => {
    const fake = makeFake(null)
    _setMosaicStoreFactory(() => fake)
    writeMosaicTree('a')
    writeMosaicTree('b')
    writeMosaicTree({ direction: 'column', first: 'preview-canvas', second: 'flow-view' })
    const r = readMosaicTree()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.tree).toEqual({ direction: 'column', first: 'preview-canvas', second: 'flow-view' })
    }
  })

  it('get 抛错时返 ok=false + error', () => {
    const fake = makeFake(null)
    fake.state.failNextGet = true
    _setMosaicStoreFactory(() => fake)
    const r = readMosaicTree()
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error).toContain('mock get failure')
  })

  it('set 抛错时返 ok=false + error', () => {
    const fake = makeFake(null)
    fake.state.failNextSet = true
    _setMosaicStoreFactory(() => fake)
    const r = writeMosaicTree('x')
    expect(r.ok).toBe(false)
    if (r.ok === false) expect(r.error).toContain('mock set failure')
  })
})
