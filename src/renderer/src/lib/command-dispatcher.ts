/**
 * command-dispatcher — CommandId 命令投递(agent:dispatchCommand 接入点)
 *
 * 与 command-registry 的 COMMAND_BY_ID 配合:标签/快捷键在 registry,
 * 实际动作在此注册并 dispatch。codex 的 registry 增强保留为单一真相源。
 */
import { COMMAND_BY_ID, type CommandId } from './command-registry.js'

export type CommandHandler = () => void | Promise<void>

const handlers = new Map<CommandId, CommandHandler>()

export const registerCommandHandler = (id: CommandId, handler: CommandHandler): void => {
  handlers.set(id, handler)
}

export const registerCommandHandlers = (map: Partial<Record<CommandId, CommandHandler>>): void => {
  for (const [id, fn] of Object.entries(map)) {
    if (fn) registerCommandHandler(id as CommandId, fn)
  }
}

export const isKnownCommandId = (id: string): id is CommandId => id in COMMAND_BY_ID

export const dispatchCommand = async (id: string): Promise<{ ok: boolean; error?: string }> => {
  if (!isKnownCommandId(id)) {
    return { ok: false, error: `unknown command: ${id}` }
  }
  const handler = handlers.get(id)
  if (!handler) {
    return { ok: false, error: `command not bound: ${id}` }
  }
  try {
    await handler()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
