/**
 * use-agent-dispatch — 监听 main 端 agent:dispatchCommand 并执行 renderer 命令
 */
import { useEffect } from 'react'
import { dispatchCommand } from '../command-dispatcher.js'
import { getGalide } from './galide-safe.js'

export const useAgentDispatch = (): void => {
  useEffect(() => {
    const g = getGalide()
    if (!g?.agent?.onDispatchCommand) return
    const off = g.agent.onDispatchCommand(({ requestId, commandId }) => {
      void (async () => {
        const result = await dispatchCommand(commandId)
        await g.agent.dispatchResult({ requestId, ok: result.ok, error: result.error })
      })()
    })
    return off
  }, [])
}
