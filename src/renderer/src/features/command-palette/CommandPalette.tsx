import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  FolderOpen,
  Sun,
  Moon,
  MessageSquare,
  Settings as SettingsIcon,
  Download,
  GitCommit,
  XCircle,
  FileText,
  Map
} from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup
} from '../../components/ui/command'
import { useUiStore } from '../../lib/store'
import { useProject } from '../../lib/ipc/use-project'
import { useScript } from '../../lib/ipc/use-script'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode } from '../../../../shared/dsl/types'

export const CommandPalette = (): JSX.Element => {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const commandPaletteMode = useUiStore((s) => s.commandPaletteMode)
  const openNewProjectDialog = useUiStore((s) => s.openNewProjectDialog)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const toggleAi = useUiStore((s) => s.toggleAiPanel)
  const openExport = useUiStore((s) => s.openExportDialog)
  const openCommit = useUiStore((s) => s.openCommitDialog)
  const closeProject = useUiStore((s) => s.closeProject)
  const projectPath = useUiStore((s) => s.projectPath)
  const scriptAst = useUiStore((s) => s.scriptAst)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const project = useProject()
  const script = useScript()

  const [files, setFiles] = useState<string[]>([])
  const close = (): void => toggleCommandPalette(false)

  // Go to File:载入项目剧本文件列表(打开面板时刷新)
  useEffect(() => {
    if (!projectPath) {
      setFiles([])
      return
    }
    void script.list(projectPath).then((list) => setFiles(list ?? []))
  }, [projectPath, script])

  const scenes =
    scriptAst != null ? collectNodes(scriptAst, (n): n is SceneNode => n.type === 'scene') : []
  const fileMode = commandPaletteMode === 'file'

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-32"
      >
        <motion.div
          initial={{ scale: 0.96, y: -8 }}
          animate={{ scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-[560px] max-w-[90vw] shadow-2xl rounded-2xl overflow-hidden"
        >
          <Command className="border border-border">
            <CommandInput
              placeholder={fileMode ? '跳转到文件...' : '输入命令或搜索...'}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>没有匹配的命令</CommandEmpty>

              {!fileMode && (
                <CommandGroup heading="项目">
                  <CommandItem
                    onSelect={() => {
                      openNewProjectDialog()
                      close()
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>新建项目</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      void project.open()
                      close()
                    }}
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>打开项目</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {projectPath && files.length > 0 && (
                <CommandGroup heading="跳转到文件">
                  {files.map((file) => (
                    <CommandItem
                      key={file}
                      value={`file ${file}`}
                      onSelect={() => {
                        setActiveScript(file)
                        close()
                      }}
                    >
                      <FileText className="w-4 h-4" />
                      <span>{file}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!fileMode && scenes.length > 0 && (
                <CommandGroup heading="跳转到场景">
                  {scenes.map((scene) => (
                    <CommandItem
                      key={scene.id}
                      value={`scene ${scene.id}`}
                      onSelect={() => {
                        setSelectedSceneId(scene.id)
                        close()
                      }}
                    >
                      <Map className="w-4 h-4" />
                      <span>{scene.id}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {!fileMode && (
                <CommandGroup heading="视图">
                  <CommandItem
                    onSelect={() => {
                      toggleAi()
                      close()
                    }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>切换 AI 助手</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      setTheme(theme === 'light' ? 'dark' : 'light')
                      close()
                    }}
                  >
                    {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    <span>{theme === 'light' ? '切换到深色主题' : '切换到浅色主题'}</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      useUiStore.getState().openPreferences()
                      close()
                    }}
                  >
                    <SettingsIcon className="w-4 h-4" />
                    <span>偏好设置</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {!fileMode && projectPath && (
                <CommandGroup heading="项目操作">
                  <CommandItem
                    onSelect={() => {
                      openExport()
                      close()
                    }}
                  >
                    <Download className="w-4 h-4" />
                    <span>导出项目…</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      openCommit()
                      close()
                    }}
                  >
                    <GitCommit className="w-4 h-4" />
                    <span>Git 提交…</span>
                  </CommandItem>
                  <CommandItem
                    onSelect={() => {
                      if (window.confirm('关闭当前项目?未保存改动请先保存。')) closeProject()
                      close()
                    }}
                  >
                    <XCircle className="w-4 h-4" />
                    <span>关闭项目</span>
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
