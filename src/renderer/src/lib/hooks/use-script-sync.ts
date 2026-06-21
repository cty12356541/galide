/**
 * useScriptSync — 脚本真相源同步 hook(P0 + P0b)
 *
 * 每个窗口(App 主窗 / 浮出窗)挂载一次:
 *   1. 单一载入点:projectPath/activeScript 变化时读盘 → store.loadScriptText(parse 在 store 内)。
 *      带 seq 守卫,快速切文件时旧读盘不覆盖新。
 *   2. 跨窗口同步:订阅 script:changed 广播(其他窗口写盘后由 main 广播),
 *      命中当前文件则 loadScriptText 刷新本窗 store → 所有视图(卡片/流程图/预览/原始编辑器)重算。
 *
 * 不在此处写盘:写盘由各编辑器(BeatCardEditor 防抖 / ScriptEditor ⌘S)走 script.write,
 * main 写盘成功后广播,本窗是发送者时 main 已跳过自身。
 */
import { useEffect, useRef } from 'react'
import { useUiStore } from '../store'
import { useScript } from '../ipc/use-script'

export const useScriptSync = (): void => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const script = useScript()
  const seqRef = useRef(0)

  // 单一载入点
  useEffect(() => {
    if (!projectPath || !activeScript) return
    // 该文件已由 setActiveScript 从缓存恢复到 store(可能含未存脏态)→ 跳过读盘,避免覆盖
    if (useUiStore.getState().fileCache[activeScript]) return
    const seq = ++seqRef.current
    void script.read(projectPath, activeScript).then((text) => {
      if (seq !== seqRef.current) return
      if (text === undefined) return
      useUiStore.getState().loadScriptText(text)
    })
  }, [projectPath, activeScript, script])

  // 跨窗口广播同步
  useEffect(() => {
    const off = window.galide.script.onChanged((e) => {
      const st = useUiStore.getState()
      if (st.projectPath !== e.projectPath || st.activeScriptFile !== e.fileName) return
      st.loadScriptText(e.source)
    })
    return off
  }, [])
}
