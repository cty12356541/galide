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
import { PanelHeader } from '../../components/ui/panel-header'
import { EmptyState } from '../../components/ui/empty-state'

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
      <EmptyState
        icon={ListTree}
        title="打开项目以查看大纲"
        description={projectName ?? undefined}
        className="h-full bg-bg p-8"
        data-testid="outline-panel"
      />
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
      <PanelHeader title="大纲" icon={ListTree} subtitle={projectName ?? ''} size="md" />

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden">
        <section className="flex flex-col overflow-hidden border-r border-border">
          <PanelHeader title="场景" icon={MapPin} subtitle={placeholderScenes.length} size="sm" />
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {placeholderScenes.length === 0 ? (
              <EmptyState icon={MapPin} title="尚未打开剧本" className="py-6 px-3" />
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
          <PanelHeader title="角色" icon={User} subtitle={characters.length} size="sm" />
          <div className="flex-1 overflow-auto p-2 space-y-0.5">
            {characters.length === 0 ? (
              <EmptyState icon={User} title="尚未创建角色" className="py-6 px-3" />
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
