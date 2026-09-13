/**
 * CommandPalette — 命令面板(cmdk 双模式:命令 / 跳转到文件)
 *
 * T1-4 重构:命令模式列表改为命令注册表(command-registry)驱动,单一真相源:
 *   - 分组/顺序来自 CATEGORY_ORDER + CATEGORY_LABELS,条目来自 COMMANDS
 *   - 每行:图标 + 标签 + 快捷键提示(acceleratorLabel(有效 accelerator))
 *     有效 accelerator 读 store.resolvedShortcuts(= 用户覆盖 ?? 默认,由
 *     useResolvedShortcutsSync 灌入),与键盘 hook 同源
 *   - cmdk 搜索经 keywords 匹配注册表 keywords 字段(中英双语)
 *   - 选中 → dispatchCommand(id) 统一执行路径,随后关闭面板
 *   - requiresProject 命令在无打开项目时隐藏(与原「项目操作」组守卫一致)
 * 跳转到文件模式(文件列表 + 场景跳转)保持原样。
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Map } from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
  CommandGroup
} from '../../components/ui/command'
import {
  COMMANDS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  COMMAND_LABELS,
  acceleratorLabel
} from '../../lib/command-registry'
import { useCommandDispatcher } from '../../lib/hooks/use-command-dispatcher'
import { useUiStore } from '../../lib/store'
import { useScript } from '../../lib/ipc/use-script'
import { collectNodes } from '../../../../shared/dsl/visitor'
import type { SceneNode } from '../../../../shared/dsl/types'

export const CommandPalette = (): JSX.Element => {
  const toggleCommandPalette = useUiStore((s) => s.toggleCommandPalette)
  const commandPaletteMode = useUiStore((s) => s.commandPaletteMode)
  const projectPath = useUiStore((s) => s.projectPath)
  const scriptAst = useUiStore((s) => s.scriptAst)
  const resolvedShortcuts = useUiStore((s) => s.resolvedShortcuts)
  const setActiveScript = useUiStore((s) => s.setActiveScript)
  const setSelectedSceneId = useUiStore((s) => s.setSelectedSceneId)
  const script = useScript()
  const { dispatchCommand } = useCommandDispatcher()

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
              placeholder={fileMode ? `${COMMAND_LABELS.goToFile}...` : '输入命令或搜索...'}
              autoFocus
            />
            <CommandList>
              <CommandEmpty>没有匹配的命令</CommandEmpty>

              {!fileMode &&
                CATEGORY_ORDER.map((category) => {
                  const items = COMMANDS.filter(
                    (c) => c.category === category && (!c.requiresProject || projectPath)
                  )
                  if (items.length === 0) return null
                  return (
                    <CommandGroup key={category} heading={CATEGORY_LABELS[category]}>
                      {items.map((cmd) => {
                        const Icon = cmd.icon
                        const hint = acceleratorLabel(resolvedShortcuts[cmd.id])
                        return (
                          <CommandItem
                            key={cmd.id}
                            value={cmd.label}
                            keywords={cmd.keywords}
                            onSelect={() => {
                              void dispatchCommand(cmd.id)
                              close()
                            }}
                          >
                            <Icon className="w-4 h-4" />
                            <span>{cmd.label}</span>
                            {hint ? (
                              <span className="ml-auto text-text-muted text-[11px] font-mono">
                                {hint}
                              </span>
                            ) : null}
                          </CommandItem>
                        )
                      })}
                    </CommandGroup>
                  )
                })}

              {projectPath && files.length > 0 && (
                <CommandGroup heading={COMMAND_LABELS.goToFile}>
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
            </CommandList>
          </Command>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
