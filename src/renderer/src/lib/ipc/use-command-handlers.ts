/**
 * use-command-handlers — agent dispatch 挂载点(agent:dispatchCommand → command-dispatcher)
 *
 * handler 注册已收口到 useCommandDispatcher(单一注册点);
 * 本 hook 仅保留挂载语义,供 App 为 agent IPC 路径装配命令表。
 */
import { useCommandDispatcher } from '../hooks/use-command-dispatcher'

export const useCommandHandlers = (): void => {
  useCommandDispatcher()
}
