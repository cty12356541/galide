/**
 * ProjectTabs — 已打开文件 tab 列表(P4 多 tab)
 *
 * 设计:
 *   - 渲染 store.openFiles,每 tab 显示文件名 + 脏态点 + 关闭(×)
 *   - 点击切换 setActiveScript(从缓存恢复,不丢脏态);× 调 closeScriptFile
 *   - 脏态:活跃文件读 scriptDirty,非活跃文件读 fileCache[file].dirty
 *   - 兜底:若 openFiles 为空但 activeScriptFile 已被直接置位(如测试/旧路径),
 *     退化为单 tab,避免主区域高度跳动
 */
import { FileText, X } from 'lucide-react'
import { useUiStore } from '../lib/store'
import { cn } from '../lib/utils'

export const ProjectTabs = (): JSX.Element => {
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const openFiles = useUiStore((s) => s.openFiles)
  const fileCache = useUiStore((s) => s.fileCache)
  const scriptDirty = useUiStore((s) => s.scriptDirty)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const closeScriptFile = useUiStore((s) => s.closeScriptFile)
  const workspacePreset = useUiStore((s) => s.workspacePreset)

  // 兜底:openFiles 空但 activeScript 已置 → 退化为单 tab
  const tabs = openFiles.length > 0 ? openFiles : activeScript ? [activeScript] : []

  if (tabs.length === 0) {
    return <div className="h-0 flex-shrink-0" data-testid="project-tabs-empty" aria-hidden />
  }

  return (
    <div
      className="h-8 bg-bg-elevated border-b border-border flex items-center px-2 gap-1 flex-shrink-0 overflow-x-auto"
      data-testid="project-tabs"
    >
      {tabs.map((file) => {
        const isActive = file === activeScript
        const dirty = isActive ? scriptDirty : (fileCache[file]?.dirty ?? false)
        return (
          <div
            key={file}
            role="tab"
            aria-selected={isActive}
            data-testid={isActive ? 'project-tab-active' : 'project-tab'}
            className={cn(
              'group h-7 pl-2.5 pr-1.5 rounded-md text-[13px] flex items-center gap-1.5 transition-colors cursor-default flex-shrink-0',
              isActive
                ? 'bg-surface text-text border border-border font-medium'
                : 'text-text-muted hover:bg-surface hover:text-text border border-transparent'
            )}
            onClick={() => setActiveScript(file)}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[160px]">{file}</span>
            {dirty ? (
              <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" title="未保存" />
            ) : null}
            <button
              type="button"
              aria-label={`关闭 ${file}`}
              className="w-4 h-4 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-bg shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                closeScriptFile(file)
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )
      })}
      <div className="flex-1" />
      <span className="px-1.5 rounded bg-bg text-text-muted text-[10px] font-medium uppercase tracking-wider flex-shrink-0">
        {workspacePreset}
      </span>
    </div>
  )
}
