import { useCallback, useEffect, useRef, useState } from 'react'
import { useErrorStore } from '../store'

type Provider = 'openai' | 'claude' | 'ollama'

export type TestPhase = 'idle' | 'pending' | 'streaming' | 'done' | 'error'

export type TestStreamState = {
  phase: TestPhase
  text: string
  error: string | null
  taskId: string | null
}

const INITIAL_TEST_STATE: TestStreamState = {
  phase: 'idle',
  text: '',
  error: null,
  taskId: null
}

export const useAiConfigForm = () => {
  const pushError = useErrorStore.getState().push
  // 测试连接用一次性 state(每次调用产生 taskId,流结束清空)
  const [testState, setTestState] = useState<TestStreamState>(INITIAL_TEST_STATE)
  const taskIdRef = useRef<string | null>(null)

  // key 配置矩阵:provider → hasKey,keySet/Delete 后本地更新,
  // 与 providersQuery 的 ai-providers-full 缓存双保险
  const [keyMap, setKeyMap] = useState<Record<string, boolean>>({})

  // 流订阅 cleanup
  useEffect(() => {
    return () => {
      // unmount 时如果还在测,尝试取消(IPC handler 端用 15s timeout 兜底)
      const tid = taskIdRef.current
      if (tid) {
        void window.galide.ai.cancel(tid).catch(() => {
          /* best-effort */
        })
      }
    }
  }, [])

  return {
    testState,
    setKey: useCallback(
      async (provider: Provider, key: string): Promise<boolean> => {
        if (!key.trim()) {
          pushError({ code: 'AI_KEY_EMPTY', message: 'API Key 不能为空', source: 'ai:keySet' })
          return false
        }
        try {
          const r = await window.galide.ai.keySet(provider, key)
          if (!r.ok) {
            pushError({ code: 'AI_KEY_SET_FAILED', message: '写入 Key 失败', source: 'ai:keySet' })
            return false
          }
          // 关键:本地立即标记,不等 providersQuery 重 fetch
          setKeyMap((prev) => ({ ...prev, [provider]: true }))
          return true
        } catch (err) {
          pushError({
            code: 'AI_KEY_SET_ERROR',
            message: err instanceof Error ? err.message : String(err),
            source: 'ai:keySet'
          })
          return false
        }
      },
      [pushError]
    ),
    deleteKey: useCallback(
      async (provider: Provider): Promise<boolean> => {
        try {
          const r = await window.galide.ai.keyDelete(provider)
          setKeyMap((prev) => ({ ...prev, [provider]: false }))
          return r.ok
        } catch (err) {
          pushError({
            code: 'AI_KEY_DELETE_ERROR',
            message: err instanceof Error ? err.message : String(err),
            source: 'ai:keyDelete'
          })
          return false
        }
      },
      [pushError]
    ),
    hasKey: useCallback(
      async (provider: Provider): Promise<boolean> => {
        // 本地 keyMap 优先(避免 IPC 往返;keySet/Delete 后立即反映)
        if (provider in keyMap) return keyMap[provider] ?? false
        try {
          return await window.galide.ai.keyHas(provider)
        } catch {
          return false
        }
      },
      [keyMap]
    ),
    /**
     * 同步版 hasKey,仅依赖本地 keyMap(初始为空 → 返回 false,
     * 等 providersQuery 拿回 hasKey 后由组件自行 fallback)。
     * UI 应优先用此避免 IPC 异步带来的"刚保存还在 false"竞态。
     */
    hasKeySync: (provider: Provider): boolean => keyMap[provider] ?? false,
    /**
     * 测试连接 — 流式版本
     * 立刻 reset state → 发起 IPC → 订阅 ai:stream/ai:status 事件
     * UI 端根据 testState.phase 渲染不同状态:
     *   pending  → "正在请求..."
     *   streaming → 逐 token 拼接到 text
     *   done     → 成功(toast 在调用方决定)
     *   error    → 失败(message 展示在面板)
     */
    testConnection: useCallback(
      async (req: {
        provider: Provider
        model?: string
        baseUrl?: string
        prompt: string
        context?: string
      }): Promise<TestStreamState> => {
        setTestState({ phase: 'pending', text: '', error: null, taskId: null })
        let resp:
          | { taskId: string; status: 'pending' }
          | { ok: false; error: string }
          | undefined
        try {
          resp = await window.galide.ai.connectionTest({
            prompt: req.prompt,
            context: req.context ?? '你是 Galide 的 AI 助手,帮用户创作 galgame 剧本。',
            provider: req.provider,
            model: req.model,
            baseUrl: req.baseUrl
          })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          pushError({ code: 'AI_CONNECTION_TEST_ERROR', message: error, source: 'ai:connectionTest' })
          const state: TestStreamState = { phase: 'error', text: '', error, taskId: null }
          setTestState(state)
          return state
        }

        if (!resp || 'ok' in resp) {
          const error = (resp as { ok: false; error: string } | undefined)?.error ?? '未知错误'
          const state: TestStreamState = { phase: 'error', text: '', error, taskId: null }
          setTestState(state)
          return state
        }

        const { taskId } = resp
        taskIdRef.current = taskId
        setTestState({ phase: 'pending', text: '', error: null, taskId })

        // 订阅流 — 必须用 connTest 专用通道(main 端 connection-test.ts 在此发流),
        // 不是共享的 ai:stream / ai:status(那是 AI 面板任务用的,connTest 永远收不到)
        return await new Promise<TestStreamState>((resolve) => {
          let resolved = false
          const offStream = window.galide.ai.connTestStream((chunk) => {
            if (chunk.taskId !== taskId) return
            setTestState((prev) => ({
              ...prev,
              phase: 'streaming' as TestPhase,
              text: prev.text + chunk.delta
            }))
          })
          const offStatus = window.galide.ai.connTestStatus((evt) => {
            if (evt.taskId !== taskId) return
            offStream()
            offStatus()
            if (resolved) return
            resolved = true
            taskIdRef.current = null
            if (evt.status === 'done') {
              const state: TestStreamState = {
                phase: 'done',
                text: '',
                error: null,
                taskId
              }
              // text 已经在 streaming 阶段累积,这里不覆盖
              setTestState((prev) => ({ ...prev, phase: 'done' }))
              resolve(state)
            } else {
              const state: TestStreamState = {
                phase: 'error',
                text: '',
                error: evt.error ?? '未知错误',
                taskId
              }
              setTestState(state)
              resolve(state)
            }
          })

          // 30s 兜底(IPC handler 端有 15s,但 stream 事件到达可能慢)
          setTimeout(() => {
            if (resolved) return
            offStream()
            offStatus()
            resolved = true
            taskIdRef.current = null
            setTestState((prev) => ({
              ...prev,
              phase: prev.phase === 'done' ? 'done' : 'error',
              error: prev.error ?? '连接测试超时(30s)'
            }))
            resolve({
              phase: 'error',
              text: '',
              error: '连接测试超时(30s)',
              taskId
            })
          }, 30_000)
        })
      },
      [pushError]
    ),
    resetTest: useCallback(() => {
      setTestState(INITIAL_TEST_STATE)
    }, [])
  }
}

export type AiConfigFormHook = ReturnType<typeof useAiConfigForm>
