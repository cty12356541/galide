import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { ProviderToolbar } from '../components/ProviderToolbar'
import { useAiConfigForm } from '../../../lib/ipc/use-ai-config-form'
import { useErrorStore, useUiStore } from '../../../lib/store'
import { toast } from '../../../components/ui/toast'
import type { AiProviderForm } from '@shared/preferences'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Loader2, Check, X as XIcon } from 'lucide-react'
import { ProviderCard } from './ProviderCard'
import { TestStreamText } from './TestStreamText'

type AiProvider = AiProviderForm['id']
type ProviderInfo = { id: AiProvider; name: string; models: string[]; hasKey: boolean }

const MODELS: Record<AiProvider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'MiniMax-M3'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: 'MiniMax-M3',
  claude: 'claude-3-5-sonnet-20241022'
}

const DEFAULT_BASE_URL: Record<AiProvider, string> = {
  openai: 'https://api.minimaxi.com/v1',
  claude: 'https://api.anthropic.com'
}

const buildTestPrompt = (
  projectName: string | null,
  mainCharacterName: string | null
): { prompt: string; context: string } => {
  const baseContext =
    '你是 Galide 的 AI 编剧助手,温柔、体贴、懂 galgame。\n' +
    '输出格式:用空行 \\n\\n 显式分段(开场 / 建议 / 引导提问)。'
  if (projectName && mainCharacterName) {
    return {
      context:
        `${baseContext}\n当前项目「${projectName}」的主角是「${mainCharacterName}」。` +
        '请直接以主角的口吻说一句招呼,不要推理、不要解释、不要分点。',
      prompt: `以「${mainCharacterName}」的口吻,向玩家打一声招呼(15-30 字)。直接输出这句话。`
    }
  }
  if (projectName) {
    return {
      context: `${baseContext}\n用户正在创作「${projectName}」,一个 galgame 项目。`,
      prompt: '用一句有温度的话向用户打招呼,问问今天想写什么(15-30 字)。直接输出这句话。'
    }
  }
  return {
    context: `${baseContext}\n用户刚启动 Galide,还没有打开项目。`,
    prompt: '用一句有温度的话向用户打招呼,邀请她开始今天的创作(15-30 字)。直接输出这句话。'
  }
}

export const AiPreferencesPanel = (): JSX.Element => {
  const form = useAiConfigForm()
  const qc = useQueryClient()
  const pushError = useErrorStore((s) => s.push)
  const projectName = useUiStore((s) => s.projectName)
  const characters = useUiStore((s) => s.manifest?.characters ?? [])

  const providersQuery = useQuery<ProviderInfo[]>({
    queryKey: ['ai-providers-full'],
    queryFn: async () => {
      const list = await window.galide.ai.listProviders()
      return list as ProviderInfo[]
    }
  })
  const configQuery = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => window.galide.ai.getConfig()
  })

  const stored = configQuery.data
  const initialProvider: AiProvider = (stored?.provider as AiProvider) ?? 'openai'
  const initialModel =
    stored?.model ??
    (MODELS[initialProvider].includes(DEFAULT_MODEL[initialProvider])
      ? DEFAULT_MODEL[initialProvider]
      : MODELS[initialProvider][0] ?? '')
  const initialBaseUrl = stored?.baseUrl ?? DEFAULT_BASE_URL[initialProvider]

  const [current, setCurrent] = useState<AiProvider>(initialProvider)
  const [model, setModel] = useState<string>(initialModel)
  const [baseUrl, setBaseUrl] = useState<string>(initialBaseUrl)

  useEffect(() => {
    if (!stored) return
    const sp = stored.provider as AiProvider
    if (current !== sp) setCurrent(sp)
    if (stored.model && stored.model !== model) setModel(stored.model)
    if (stored.baseUrl && stored.baseUrl !== baseUrl) setBaseUrl(stored.baseUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored])

  const testState = form.testState

  const handleSelectProvider = (id: string): void => {
    const provider = id as AiProvider
    setCurrent(provider)
    if (!MODELS[provider].includes(model)) {
      setModel(DEFAULT_MODEL[provider])
    }
    if (!baseUrl) {
      setBaseUrl(DEFAULT_BASE_URL[provider])
    }
  }

  const handleSave = async (): Promise<void> => {
    try {
      await window.galide.ai.setConfig({ provider: current, model, baseUrl })
      qc.invalidateQueries({ queryKey: ['ai-config'] })
      qc.invalidateQueries({ queryKey: ['ai-providers-full'] })
      qc.invalidateQueries({ queryKey: ['ai-providers'] })
      toast({ message: '已保存 AI 配置', variant: 'success' })
    } catch (err) {
      pushError({
        code: 'AI_CONFIG_SAVE_FAILED',
        message: err instanceof Error ? err.message : String(err),
        source: 'ai:setConfig'
      })
    }
  }

  const handleKeySaved = async (key: string): Promise<boolean> => {
    const ok = await form.setKey(current, key)
    if (ok) {
      qc.invalidateQueries({ queryKey: ['ai-providers-full'] })
      qc.invalidateQueries({ queryKey: ['ai-providers'] })
    }
    return ok
  }

  const handleKeyDeleted = async (): Promise<boolean> => {
    const ok = await form.deleteKey(current)
    if (ok) {
      qc.invalidateQueries({ queryKey: ['ai-providers-full'] })
      qc.invalidateQueries({ queryKey: ['ai-providers'] })
    }
    return ok
  }

  const handleTest = (): void => {
    const mainChar = characters[0]?.name ?? null
    const { prompt, context } = buildTestPrompt(projectName, mainChar)
    void form.testConnection({ provider: current, model, baseUrl, prompt, context })
  }

  const providers = providersQuery.data ?? []
  const currentProvider = providers.find((p) => p.id === current)
  const hasKey = form.hasKeySync(current) || currentProvider?.hasKey === true
  const isTesting = testState.phase === 'pending' || testState.phase === 'streaming'

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">AI 提供商</h2>
        <p className="text-sm text-text-muted mb-4">
          选择默认 AI 提供商。Key 保存在本地加密存储,不会暴露给渲染层。
        </p>
        <ProviderToolbar
          providers={providers.map((p) => ({ id: p.id, label: p.name, hasKey: p.hasKey }))}
          current={current}
          onSelect={handleSelectProvider}
        />
      </div>

      {currentProvider && (
        <ProviderCard
          hasKey={hasKey}
          model={model}
          modelOptions={MODELS[current]}
          baseUrl={baseUrl}
          onKeySaved={handleKeySaved}
          onKeyDeleted={handleKeyDeleted}
          onModelChange={setModel}
          onBaseUrlChange={setBaseUrl}
        />
      )}

      <div className="flex items-center gap-2">
        <Button onClick={() => void handleSave()}>保存配置</Button>
        <Button variant="secondary" onClick={handleTest} disabled={isTesting || !hasKey}>
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1" />
          )}
          {isTesting ? '请求中…' : '测试连接'}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {(isTesting || testState.phase === 'done' || testState.phase === 'error') && (
          <motion.div
            key={testState.taskId ?? testState.phase}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`rounded-2xl border p-4 ${
              testState.phase === 'error'
                ? 'border-danger bg-danger-soft'
                : testState.phase === 'done'
                  ? 'border-success bg-success-soft'
                  : 'border-border bg-bg-elevated'
            }`}
          >
            <div className="flex items-center gap-2 mb-2 text-xs">
              {testState.phase === 'pending' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-text-muted" />
                  <span className="text-text-muted">
                    正在请求 {currentProvider?.name ?? current} · {model}
                  </span>
                </>
              )}
              {testState.phase === 'streaming' && (
                <>
                  <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-text-muted">流式响应中…</span>
                </>
              )}
              {testState.phase === 'done' && (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span className="text-success-strong font-medium">连接成功</span>
                </>
              )}
              {testState.phase === 'error' && (
                <>
                  <XIcon className="w-3.5 h-3.5 text-danger" />
                  <span className="text-danger-strong font-medium">连接失败</span>
                </>
              )}
            </div>
            {(testState.phase === 'streaming' || testState.phase === 'done') && (
              <TestStreamText text={testState.text} streaming={testState.phase === 'streaming'} />
            )}
            {testState.phase === 'error' && (
              <div className="text-sm leading-relaxed text-danger-strong font-mono">
                {testState.error ?? '未知错误'}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
