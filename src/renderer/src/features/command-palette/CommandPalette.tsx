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
  XCircle
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

export const CommandPalette = (): JSX.Element => {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)
  const toggleAi = useUiStore((s) => s.toggleAiPanel)
  const openExport = useUiStore((s) => s.openExportDialog)
  const openCommit = useUiStore((s) => s.openCommitDialog)
  const closeProject = useUiStore((s) => s.closeProject)
  const projectPath = useUiStore((s) => s.projectPath)
  const project = useProject()

  const close = (): void => toggleCommandPalette(false)

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
            <CommandInput placeholder="输入命令或搜索..." autoFocus />
            <CommandList>
              <CommandEmpty>没有匹配的命令</CommandEmpty>
              <CommandGroup heading="项目">
                <CommandItem
                  onSelect={() => {
                    void project.create('新项目')
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
              {projectPath && (
                <CommandGroup heading="项目">
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
