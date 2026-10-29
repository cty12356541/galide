import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  FileText,
  Plus,
  RefreshCw,
  FilePlus,
  Copy,
  Trash2,
  Edit3,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen
} from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { PanelHeader } from '../../components/ui/panel-header'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '../../components/ui/context-menu'
import { useUiStore, useErrorStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { cn } from '../../lib/utils'
import { toast } from '../../components/ui/toast'
import { usePromptDialog } from '../../components/ui/prompt-dialog'
import { useConfirmDialog } from '../../components/ui/confirm-dialog'

export interface ScriptTreeFolder {
  kind: 'folder'
  name: string
  path: string
  children: ScriptTreeNode[]
}

export interface ScriptTreeFile {
  kind: 'file'
  name: string
  path: string
}

export type ScriptTreeNode = ScriptTreeFolder | ScriptTreeFile

interface MutableFolder {
  name: string
  path: string
  folders: Map<string, MutableFolder>
  files: ScriptTreeFile[]
}

const toSortedNodes = (folder: MutableFolder): ScriptTreeNode[] => {
  const subFolders: ScriptTreeFolder[] = Array.from(folder.folders.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((sub) => ({
      kind: 'folder',
      name: sub.name,
      path: sub.path,
      children: toSortedNodes(sub)
    }))
  const sortedFiles = [...folder.files].sort((a, b) => a.name.localeCompare(b.name))
  return [...subFolders, ...sortedFiles]
}

/**
 * 将相对 scripts/ 的 .gal 路径数组构建为树结构(目录在前,文件在后,字典序稳定)。
 */
export const buildScriptTree = (files: readonly string[]): ScriptTreeNode[] => {
  const root: MutableFolder = { name: '', path: '', folders: new Map(), files: [] }
  for (const rawPath of files) {
    const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
    if (!normalized) continue
    const parts = normalized.split('/')
    let cursor = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]!
      const nextPath = cursor.path ? `${cursor.path}/${seg}` : seg
      let child = cursor.folders.get(seg)
      if (!child) {
        child = { name: seg, path: nextPath, folders: new Map(), files: [] }
        cursor.folders.set(seg, child)
      }
      cursor = child
    }
    const leafName = parts[parts.length - 1]!
    cursor.files.push({ kind: 'file', name: leafName, path: normalized })
  }
  return toSortedNodes(root)
}

/**
 * 剧本文件树(项目根 scripts/ 下递归列出所有 .gal,支持子目录折叠与右键删除)
 *
 * 规约: 决策树(剧本)是 .gal 文件,UI 切换 activeScriptFile
 * 时会触发 ScriptEditor 重新 read → FlowView 重新 read → PreviewCanvas 重新 read。
 */
export const ScriptFileTree = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScript = useUiStore((s) => s.activeScriptFile)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const script = useScript()
  const pushError = useErrorStore((s) => s.push)
  const { prompt, PromptDialog } = usePromptDialog()
  const { confirm, ConfirmDialog } = useConfirmDialog()
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({})

  const refresh = useCallback(async () => {
    if (!projectPath) {
      setFiles([])
      return
    }
    setLoading(true)
    try {
      const list = await script.list(projectPath)
      setFiles(list ?? [])
    } finally {
      setLoading(false)
    }
  }, [projectPath, script])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 切到新项目或当前激活文件被删时,自动选中第一个可用文件(无文件则置空)
  useEffect(() => {
    if (files.length === 0) {
      if (activeScript !== null) setActiveScript(null)
      return
    }
    if (!activeScript || !files.includes(activeScript)) {
      setActiveScript(files[0] ?? null)
    }
  }, [files, activeScript, setActiveScript])

  const treeNodes = useMemo(() => buildScriptTree(files), [files])

  const toggleFolder = useCallback((folderPath: string) => {
    setCollapsedFolders((prev) => ({ ...prev, [folderPath]: !prev[folderPath] }))
  }, [])

  const handleCopyName = (file: string): void => {
    void navigator.clipboard.writeText(file).then(() => {
      toast({ message: `已复制 ${file}`, variant: 'success' })
    })
  }

  const handleRename = async (oldName: string): Promise<void> => {
    if (!projectPath) return
    const newName = await prompt({ title: '重命名文件', defaultValue: oldName })
    if (!newName || newName === oldName) return
    const fileName = newName.endsWith('.gal') ? newName : `${newName}.gal`
    if (files.includes(fileName)) {
      pushError({
        code: 'SCRIPT_EXISTS',
        message: `文件已存在: ${fileName}`,
        source: 'script:write'
      })
      return
    }
    try {
      const text = (await script.read(projectPath, oldName)) ?? ''
      const writeRes = await script.write(projectPath, fileName, text)
      if (!writeRes.ok) return
      await script.delete(projectPath, oldName)
      if (activeScript === oldName) setActiveScript(fileName)
      toast({ message: `已重命名为 ${fileName}`, variant: 'success' })
      await refresh()
    } catch (err) {
      pushError({
        code: 'SCRIPT_RENAME_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'script:write'
      })
    }
  }

  const handleDelete = async (file: string): Promise<void> => {
    if (!projectPath) return
    const confirmed = await confirm({
      title: '删除剧本文件',
      description: `确定要删除 "${file}" 吗？删除后无法直接恢复。`,
      confirmText: '删除',
      cancelText: '取消',
      danger: true
    })
    if (!confirmed) return
    try {
      const res = await script.delete(projectPath, file)
      if (!res.ok) return
      if (activeScript === file) {
        const remaining = files.filter((f) => f !== file)
        setActiveScript(remaining[0] ?? null)
      }
      await refresh()
      toast({ message: `已删除 ${file}`, variant: 'success' })
    } catch (err) {
      pushError({
        code: 'SCRIPT_DELETE_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'script:delete'
      })
    }
  }

  const handleNew = async (): Promise<void> => {
    if (!projectPath) return
    const name = await prompt({ title: '新建剧本文件名', defaultValue: 'chapter2.gal' })
    if (!name) return
    const fileName = name.endsWith('.gal') ? name : `${name}.gal`
    if (files.includes(fileName)) {
      pushError({
        code: 'SCRIPT_EXISTS',
        message: `文件已存在: ${fileName}`,
        source: 'script:write'
      })
      return
    }
    try {
      const baseTitle = fileName.split('/').pop()?.replace(/\.gal$/, '') ?? fileName
      const res = await script.write(projectPath, fileName, `# ${baseTitle}\n\n`)
      if (!res.ok) return
      setActiveScript(fileName)
      await refresh()
      toast({ message: `已创建 ${fileName}`, variant: 'success' })
    } catch (err) {
      pushError({
        code: 'SCRIPT_CREATE_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'script:write'
      })
    }
  }

  const renderNode = (node: ScriptTreeNode, depth: number): JSX.Element => {
    if (node.kind === 'folder') {
      const collapsed = Boolean(collapsedFolders[node.path])
      return (
        <div key={`folder:${node.path}`}>
          <button
            type="button"
            onClick={() => toggleFolder(node.path)}
            aria-expanded={!collapsed}
            data-testid={`script-folder-${node.path}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            className="w-full flex items-center gap-1 pr-2 py-1 rounded-md text-[12px] text-text-muted hover:bg-bg-elevated hover:text-text text-left transition-colors"
            title={node.path}
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            )}
            {collapsed ? (
              <Folder className="w-3.5 h-3.5 shrink-0 text-text-muted" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 shrink-0 text-text-muted" />
            )}
            <span className="truncate font-medium">{node.name}</span>
          </button>
          {!collapsed ? (
            <div className="space-y-0.5">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          ) : null}
        </div>
      )
    }

    const isActive = node.path === activeScript
    return (
      <ContextMenu key={`file:${node.path}`}>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            onClick={() => setActiveScript(node.path)}
            data-testid={`script-file-${node.path}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            className={cn(
              'w-full flex items-center gap-1.5 pr-2 py-1 rounded-md text-[13px] text-left transition-colors',
              isActive
                ? 'bg-accent-soft text-accent font-medium'
                : 'text-text-muted hover:bg-bg-elevated hover:text-text'
            )}
            title={node.path}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="file-context-menu">
          <ContextMenuItem onSelect={() => handleCopyName(node.path)}>
            <Copy className="w-3.5 h-3.5 text-text-muted" />
            <span>复制文件名</span>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void handleRename(node.path)}>
            <Edit3 className="w-3.5 h-3.5 text-text-muted" />
            <span>重命名</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => void handleDelete(node.path)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>删除</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  if (!projectPath) return <div />

  return (
    <div className="border-b border-border">
      <PanelHeader
        title="剧本"
        icon={FilePlus}
        subtitle={files.length}
        size="md"
        actions={
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void refresh()}
              title="刷新"
              className="h-7 w-7"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void handleNew()}
              title="新建剧本"
              className="h-7 w-7"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        }
      />
      <ScrollArea className="max-h-48">
        <div className="px-1.5 pb-1.5 space-y-0.5">
          {files.length === 0 ? (
            <div className="text-[12px] text-text-muted px-2 py-1.5">无 .gal 脚本</div>
          ) : (
            treeNodes.map((node) => renderNode(node, 0))
          )}
        </div>
      </ScrollArea>
      <PromptDialog />
      <ConfirmDialog />
    </div>
  )
}
