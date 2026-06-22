/**
 * useProjectScriptAst — 加载全项目 merged AST(与 export 同源)
 */
import { useCallback, useEffect, useRef } from 'react'
import { useUiStore } from '../store'

export const useProjectScriptAst = (): void => {
  const projectPath = useUiStore((s) => s.projectPath)
  const setProjectMergedAst = useUiStore((s) => s.setProjectMergedAst)
  const seqRef = useRef(0)

  const refresh = useCallback((): void => {
    if (!projectPath) {
      setProjectMergedAst(null, null)
      return
    }
    const seq = ++seqRef.current
    void window.galide.script.parseProject(projectPath).then((r) => {
      if (seq !== seqRef.current) return
      if (r.ok === true) {
        setProjectMergedAst(r.mergedAst, null)
      } else {
        setProjectMergedAst(null, r.error)
      }
    })
  }, [projectPath, setProjectMergedAst])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const off = window.galide.script.onChanged((e) => {
      if (e.projectPath !== useUiStore.getState().projectPath) return
      refresh()
    })
    return off
  }, [refresh])
}
