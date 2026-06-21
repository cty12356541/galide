/**
 * useNewScriptFile — 新建 .gal 脚本文件(⌘N 入口)
 *
 * 复用 ScriptFileTree 的新建语义:prompt 文件名 → 校验重名 → 写空模板 →
 * setActiveScript(触发 useScriptSync 载入 + ScriptFileTree 重列)→ toast。
 * 创建后 activeScript 变化会触发 ScriptFileTree 的 refresh effect,无需手动刷新。
 */
import { useCallback } from 'react'
import { useUiStore, useErrorStore } from '../store'
import { useScript } from '../ipc/use-script'
import { toast } from '../../components/ui/toast'

export const useNewScriptFile = (): (() => Promise<void>) => {
  const projectPath = useUiStore((s) => s.projectPath)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const script = useScript()
  const pushError = useErrorStore((s) => s.push)

  return useCallback(async (): Promise<void> => {
    if (!projectPath) return
    const name = window.prompt('新建剧本文件名', 'chapter2.gal')
    if (!name) return
    const fileName = name.endsWith('.gal') ? name : `${name}.gal`
    const existing = await script.list(projectPath)
    if (existing?.includes(fileName)) {
      pushError({
        code: 'SCRIPT_EXISTS',
        message: `文件已存在: ${fileName}`,
        source: 'script:write'
      })
      return
    }
    try {
      await script.write(projectPath, fileName, `# ${fileName.replace(/\.gal$/, '')}\n\n`)
      setActiveScript(fileName)
      toast({ message: `已创建 ${fileName}`, variant: 'success' })
    } catch (err) {
      pushError({
        code: 'SCRIPT_CREATE_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'script:write'
      })
    }
  }, [projectPath, setActiveScript, script, pushError])
}
