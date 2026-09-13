// T3-3 spike harness: run the repo's own Web export pipeline
// (parseProjectScripts -> WebComposer -> runComposer) on the fixture project,
// producing .omo/spike/export/ (index.html + assets/).
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { parseProjectScripts, assertExportableScripts } from '../../src/main/export/parse-project-scripts'
import { WebComposer } from '../../src/main/export/web-composer'
import { runComposer } from '../../src/main/export/composer'

const REPO = join(__dirname, '../..')
const PROJECT = join(REPO, '.omo/spike/fixture-project')
const OUT = join(REPO, '.omo/spike/export')

const nodeFs = {
  readdir: (p: string) => fs.readdir(p),
  readFile: (p: string) => fs.readFile(p, 'utf-8')
}

describe('T3-3 spike: web export of fixture project', () => {
  it('produces index.html + assets via repo code path', async () => {
    await fs.rm(OUT, { recursive: true, force: true })
    await fs.mkdir(OUT, { recursive: true })

    const scriptsDir = join(PROJECT, 'scripts')
    const { asts, failures } = await parseProjectScripts(scriptsDir, nodeFs)
    const galCount = (await fs.readdir(scriptsDir)).filter((f) => f.endsWith('.gal')).length
    assertExportableScripts(asts, failures, galCount)

    const composer = new WebComposer()
    const result = await runComposer(composer, {
      request: { projectPath: PROJECT, target: 'web', outputPath: OUT },
      asts,
      outputDir: OUT,
      progress: () => {}
    } as Parameters<typeof runComposer>[1])

    expect(result.paths.length).toBe(1)
    expect(result.paths[0]).toBe(join(OUT, 'index.html'))

    const html = await fs.readFile(join(OUT, 'index.html'), 'utf-8')
    expect(html).toContain('SPIKE_OK')
    expect(html).toContain('VM_GRAPH')

    const bg = await fs.stat(join(OUT, 'assets/backgrounds/classroom.png'))
    expect(bg.size).toBeGreaterThan(0)
    const sprite = await fs.stat(join(OUT, 'assets/sprites/yuki_smile.png'))
    expect(sprite.size).toBeGreaterThan(0)

    console.log('[spike] export written:', result.paths)
  })
})
