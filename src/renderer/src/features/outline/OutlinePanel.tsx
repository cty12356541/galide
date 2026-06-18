/**
 * OutlinePanel — 大纲视图(中央 tab + SidePanel 共用)
 *
 * 数据源:useUiStore((s) => s.manifest),从 ProjectManifest 派生 scene / character 列表。
 * 真实 outline 推导(从 .gal script parse → scene + choice tree)留 V2,本轮只展示
 * manifest 现有字段 + 占位 scene 名,保证组件能 mount + 渲染 + 通过 typecheck。
 *
 * 适配 dockview 签名:
 *  - DockviewCenterTabs 用 `as unknown as IDockviewPanelProps` 强转,我们接受
 *    props 但不访问 props.params / props.api(诊断报告 B-07 提到的"as unknown"反模式,
 *    本组件签名仍为 () => JSX.Element,与强转对齐)。
 *  - SidePanel 不传 props,直接 mount 也 OK。
 *
 * 行为:
 *  - 上半部分:scene 列表(目前从 manifest.characters + 静态 fallback 占位)
 *  - 下半部分:character 列表(从 manifest.characters 派生)
 *  - 空态:项目未打开 / manifest 缺失时显示提示
 */

import { useUiStore } from '../../lib/store'
import { ListTree, User, MapPin } from 'lucide-react'

/**
 * Note on the props signature: this component is rendered by both:
 *  - SidePanel directly (no props)
 *  - DockviewCenterTabs via `as unknown as IDockviewPanelProps` cast
 * Both code paths work because we declare `(): JSX.Element`. The dockview adapter
 * casting in DockviewCenterTabs handles the prop forwarding concern externally.
 */
export const OutlinePanel = (): JSX.Element => {
  const projectName = useUiStore((s) => s.projectName)
  const manifest = useUiStore((s) => s.manifest)
  const activeScriptFile = useUiStore((s) => s.activeScriptFile)

  if (!manifest) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-text-muted bg-bg p-8" data-testid="outline-panel">
        <ListTree className="w-8 h-8 mb-2 opacity-40" />
        <div className="text-xs">打开项目以查看大纲</div>
        {projectName && <div className="text-[10px] mt-1 opacity-60">{projectName}</div>}
      </div>
    )
  }

  const characters = manifest.characters ?? []

  // 占位:从 activeScriptFile 推一个伪 scene 名(本轮不解析 .gal)
  // 后续 PR:走 script.parse + 提取 === 段落 ===
  const placeholderScenes = activeScriptFile
    ? [
        { id: 'opening', label: '开场', line: 1 },
        { id: 'meet', label: '相遇', line: 18 },
        { id: 'choice', label: '选择点', line: 27 }
      ]
    : []

  return (
    <div className="h-full flex flex-col bg-bg" data-testid="outline-panel">
      <div className="h-10 px-3 flex items-center gap-2 border-b border-border bg-surface">
        <ListTree className="w-4 h-4 text-text-muted" />
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">大纲</span>
        <span className="text-[10px] text-text-muted">{projectName ?? ''}</span>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden">
        <section className="flex flex-col overflow-hidden border-r border-border">
          <header className="h-9 px-3 flex items-center gap-1.5 bg-surface border-b border-border">
            <MapPin className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              场景
            </span>
            <span className="text-[10px] text-text-muted">({placeholderScenes.length})</span>
          </header>
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {placeholderScenes.length === 0 ? (
              <div className="text-[11px] text-text-muted px-2 py-1.5">尚未打开剧本</div>
            ) : (
              placeholderScenes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-elevated text-left"
                >
                  <span className="text-[10px] font-mono text-text-muted w-6 text-right">
                    {s.line}
                  </span>
                  <span className="text-[12px]">{s.label}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col overflow-hidden">
          <header className="h-9 px-3 flex items-center gap-1.5 bg-surface border-b border-border">
            <User className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
              角色
            </span>
            <span className="text-[10px] text-text-muted">({characters.length})</span>
          </header>
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {characters.length === 0 ? (
              <div className="text-[11px] text-text-muted px-2 py-1.5">尚未创建角色</div>
            ) : (
              characters.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-elevated"
                >
                  <User className="w-3 h-3 text-text-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] truncate">{c.name}</div>
                    {c.personality && (
                      <div className="text-[10px] text-text-muted truncate">{c.personality}</div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <footer className="h-7 px-3 flex items-center text-[10px] text-text-muted border-t border-border bg-surface">
        大纲视图基于 manifest 派生。V2:解析 .gal 脚本生成 scene + choice 树。
      </footer>
    </div>
  )
}
