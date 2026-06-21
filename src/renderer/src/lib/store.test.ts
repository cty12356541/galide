/**
 * useUiStore — 功能即岛 v2 dock 模型验证
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { useUiStore, useErrorStore } from './store'
import type { ScriptNode } from '../../../shared/dsl/types'

describe('useUiStore — v2 dock 模型', () => {
  beforeEach(() => {
    useUiStore.setState({
      workspacePreset: 'writing',
      dockSide: { project: 'left', git: 'left', outline: 'left', character: 'left', ai: 'right' },
      visiblePerSide: { left: 'project', right: 'ai', bottom: null },
      activeSubIsland: { project: 'scripts', git: 'git', outline: 'outline', character: 'profiles', ai: 'ai' },
      floatingPanels: []
    })
  })

  it('默认 dockSide / visiblePerSide / activeSubIsland', () => {
    const s = useUiStore.getState()
    expect(s.dockSide.ai).toBe('right')
    expect(s.visiblePerSide.left).toBe('project')
    expect(s.visiblePerSide.right).toBe('ai')
    expect(s.activeSubIsland.project).toBe('scripts')
  })

  it('showToolWindow 把主岛置入其 dockSide 侧', () => {
    useUiStore.getState().showToolWindow('git')
    expect(useUiStore.getState().visiblePerSide.left).toBe('git')
  })

  it('hideToolWindow 收起该侧(仅当该侧正是它)', () => {
    useUiStore.getState().hideToolWindow('project')
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
  })

  it('toggleToolWindow 切换可见性', () => {
    useUiStore.getState().toggleToolWindow('project')
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
    useUiStore.getState().toggleToolWindow('project')
    expect(useUiStore.getState().visiblePerSide.left).toBe('project')
  })

  it('setDockSide 移动主岛:旧侧清空、新侧承接(若原可见)', () => {
    useUiStore.getState().setDockSide('project', 'bottom')
    expect(useUiStore.getState().dockSide.project).toBe('bottom')
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
    expect(useUiStore.getState().visiblePerSide.bottom).toBe('project')
  })

  it('setActiveSubIsland 切 tab', () => {
    useUiStore.getState().setActiveSubIsland('character', 'voice')
    expect(useUiStore.getState().activeSubIsland.character).toBe('voice')
  })

  it('toggleLeftPanel 切换左槽(有内容收起,无则显 project)', () => {
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().visiblePerSide.left).toBeNull()
    useUiStore.getState().toggleLeftPanel()
    expect(useUiStore.getState().visiblePerSide.left).toBe('project')
  })

  it('toggleAiPanel 切换 AI 主岛可见性', () => {
    expect(useUiStore.getState().visiblePerSide.right).toBe('ai')
    useUiStore.getState().toggleAiPanel()
    expect(useUiStore.getState().visiblePerSide.right).toBeNull()
    useUiStore.getState().toggleAiPanel()
    expect(useUiStore.getState().visiblePerSide.right).toBe('ai')
  })

  it('setAiDockedLocation 移 AI 到指定侧并显示', () => {
    useUiStore.getState().setAiDockedLocation('bottom')
    expect(useUiStore.getState().dockSide.ai).toBe('bottom')
    expect(useUiStore.getState().visiblePerSide.right).toBeNull()
    expect(useUiStore.getState().visiblePerSide.bottom).toBe('ai')
  })

  it('addFloatingPanel 三类 id 均可加入且去重', () => {
    useUiStore.getState().addFloatingPanel('script-editor')
    useUiStore.getState().addFloatingPanel('git')
    useUiStore.getState().addFloatingPanel('voice')
    useUiStore.getState().addFloatingPanel('git')
    expect(useUiStore.getState().floatingPanels).toEqual(['script-editor', 'git', 'voice'])
  })

  it('closeProject 清理 projectPath/name/manifest', () => {
    useUiStore.setState({
      projectPath: '/x',
      projectName: 'X',
      manifest: { name: 'X' } as never
    })
    useUiStore.getState().closeProject()
    expect(useUiStore.getState().projectPath).toBeNull()
    expect(useUiStore.getState().projectName).toBeNull()
    expect(useUiStore.getState().manifest).toBeNull()
  })
})

const P4_SAMPLE = `# 第一章

## 教室·午后
背景: assets/backgrounds/classroom.png
BGM: assets/bgm/gentle_piano.mp3

[角色:小雪 | 立绘:小雪_校服_微笑.png | 位置:left]
小雪: "今天的樱花,真漂亮呢。"

[角色:主角 | 立绘:主角_默认.png | 位置:right]
主角: "……是啊。"

* "邀请她一起看樱花" -> 樱花树下

## 樱花树下
小雪: "诶?!一起吗?"
`

describe('useUiStore — P4 卡片撤销 + 多 tab', () => {
  beforeEach(() => {
    useUiStore.setState({
      projectPath: '/tmp/demo',
      activeScriptFile: null,
      openFiles: [],
      fileCache: {},
      scriptSource: '',
      scriptAst: null,
      scriptDiagnostics: [],
      scriptDirty: false,
      scriptPast: [],
      scriptFuture: [],
      selectedSceneId: null
    })
  })

  const mutateFirstLine = (ast: ScriptNode): void => {
    const scene = ast.children.find((n) => n.type === 'scene')
    if (scene && scene.type === 'scene') {
      const dlg = scene.children.find((n) => n.type === 'dialogue')
      if (dlg && dlg.type === 'dialogue') dlg.lines[0] = '改后的台词'
    }
  }

  it('editScriptAst 入 past;undo 还原源串', () => {
    const st = useUiStore.getState()
    st.loadScriptText(P4_SAMPLE)
    const before = useUiStore.getState().scriptSource
    st.editScriptAst(mutateFirstLine)
    expect(useUiStore.getState().scriptSource).not.toBe(before)
    expect(useUiStore.getState().scriptPast).toHaveLength(1)
    st.undo()
    expect(useUiStore.getState().scriptSource).toBe(before)
    expect(useUiStore.getState().scriptAst).not.toBeNull()
  })

  it('redo 重做', () => {
    const st = useUiStore.getState()
    st.loadScriptText(P4_SAMPLE)
    st.editScriptAst(mutateFirstLine)
    const edited = useUiStore.getState().scriptSource
    st.undo()
    st.redo()
    expect(useUiStore.getState().scriptSource).toBe(edited)
    expect(useUiStore.getState().scriptFuture).toHaveLength(0)
  })

  it('undo 在 past 空时 no-op', () => {
    const st = useUiStore.getState()
    st.loadScriptText(P4_SAMPLE)
    const before = useUiStore.getState().scriptSource
    st.undo()
    expect(useUiStore.getState().scriptSource).toBe(before)
  })

  it('editScriptSource 清 future(原始编辑使重做失效)', () => {
    const st = useUiStore.getState()
    st.loadScriptText(P4_SAMPLE)
    st.editScriptAst(mutateFirstLine)
    st.undo()
    expect(useUiStore.getState().scriptFuture).toHaveLength(1)
    st.editScriptSource(P4_SAMPLE)
    expect(useUiStore.getState().scriptFuture).toHaveLength(0)
  })

  it('loadScriptText 重置 history', () => {
    const st = useUiStore.getState()
    st.loadScriptText(P4_SAMPLE)
    st.editScriptAst(mutateFirstLine)
    expect(useUiStore.getState().scriptPast).toHaveLength(1)
    st.loadScriptText(P4_SAMPLE)
    expect(useUiStore.getState().scriptPast).toHaveLength(0)
    expect(useUiStore.getState().scriptFuture).toHaveLength(0)
  })

  it('多 tab:切换缓存脏态,切回复原 + 保留撤销栈', () => {
    const st = useUiStore.getState()
    st.setActiveScript('a.gal')
    st.loadScriptText(P4_SAMPLE)
    const aClean = useUiStore.getState().scriptSource
    st.editScriptAst(mutateFirstLine)
    const aEdited = useUiStore.getState().scriptSource
    expect(useUiStore.getState().scriptDirty).toBe(true)
    // 切到 b.gal(未缓存 → 模拟 useScriptSync 读盘)
    st.setActiveScript('b.gal')
    st.loadScriptText(P4_SAMPLE)
    expect(useUiStore.getState().activeScriptFile).toBe('b.gal')
    expect(useUiStore.getState().scriptSource).toBe(aClean)
    expect(useUiStore.getState().scriptDirty).toBe(false)
    // 切回 a.gal → 恢复脏态 + 撤销栈
    st.setActiveScript('a.gal')
    expect(useUiStore.getState().scriptSource).toBe(aEdited)
    expect(useUiStore.getState().scriptDirty).toBe(true)
    expect(useUiStore.getState().scriptPast).toHaveLength(1)
    st.undo()
    expect(useUiStore.getState().scriptSource).toBe(aClean)
  })

  it('closeScriptFile 关活跃文件切到邻居', () => {
    const st = useUiStore.getState()
    st.setActiveScript('a.gal')
    st.loadScriptText(P4_SAMPLE)
    st.editScriptAst(mutateFirstLine)
    st.setActiveScript('b.gal')
    st.loadScriptText(P4_SAMPLE)
    expect(useUiStore.getState().activeScriptFile).toBe('b.gal')
    // 关闭当前活跃 b.gal → 切回 a.gal(邻居,从缓存恢复脏态)
    st.closeScriptFile('b.gal')
    expect(useUiStore.getState().activeScriptFile).toBe('a.gal')
    expect(useUiStore.getState().openFiles).toEqual(['a.gal'])
    expect(useUiStore.getState().scriptDirty).toBe(true)
  })

  it('closeProject 清空 openFiles/fileCache/history', () => {
    const st = useUiStore.getState()
    st.setActiveScript('a.gal')
    st.loadScriptText(P4_SAMPLE)
    st.editScriptAst(mutateFirstLine)
    st.closeProject()
    const s = useUiStore.getState()
    expect(s.openFiles).toEqual([])
    expect(s.fileCache).toEqual({})
    expect(s.scriptPast).toEqual([])
    expect(s.scriptFuture).toEqual([])
    expect(s.activeScriptFile).toBeNull()
  })
})

describe('useErrorStore — P1 兼容输入', () => {
  beforeEach(() => {
    useErrorStore.setState({ entries: [] })
  })

  it('push 接受宽松输入(无 id / timestamp)', () => {
    useErrorStore.getState().push({ code: 'TEST', message: 'hi', source: 'unit-test' })
    const entry = useErrorStore.getState().entries[0]
    expect(entry?.id).toBeTruthy()
    expect(typeof entry?.timestamp).toBe('number')
    expect(entry?.code).toBe('TEST')
  })

  it('push 同 id 去重', () => {
    useErrorStore.getState().push({ id: 'fixed-id', code: 'A', message: '1', source: 'x' })
    useErrorStore.getState().push({ id: 'fixed-id', code: 'A', message: '2', source: 'x' })
    const list = useErrorStore.getState().entries.filter((e) => e.id === 'fixed-id')
    expect(list).toHaveLength(1)
    expect(list[0]?.message).toBe('2')
  })

  it('push 超过 MAX_ERROR_ENTRIES(100)裁剪', () => {
    for (let i = 0; i < 110; i++) {
      useErrorStore.getState().push({ code: 'X', message: String(i), source: 'x' })
    }
    expect(useErrorStore.getState().entries.length).toBeLessThanOrEqual(100)
  })
})
