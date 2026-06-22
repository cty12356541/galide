import { describe, it, expect } from 'vitest'
import { searchProjectScripts } from './search-project-scripts.js'

describe('searchProjectScripts', () => {
  it('returns hits with file/line/column/snippet', async () => {
    const fs = {
      readdir: async () => ['alpha.gal', 'beta.gal', 'readme.md'],
      readFile: async (p: string) => {
        if (p.endsWith('alpha.gal')) return '## 教室\n小雪: "樱花"\n'
        if (p.endsWith('beta.gal')) return '## 路上\n主角: "樱花树下"\n'
        return ''
      }
    }
    const hits = await searchProjectScripts('/proj/scripts', '樱花', fs)
    expect(hits.length).toBe(2)
    expect(hits[0]).toMatchObject({ file: 'alpha.gal', line: 2, snippet: expect.stringContaining('樱花') })
  })

  it('returns empty for blank query', async () => {
    const hits = await searchProjectScripts('/proj/scripts', '  ', {
      readdir: async () => ['a.gal'],
      readFile: async () => ''
    })
    expect(hits).toEqual([])
  })
})
