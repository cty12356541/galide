import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { ProviderToolbar } from '../components/ProviderToolbar'
import { ApiKeyEditor } from '../components/ApiKeyEditor'
import { ModelEditor } from '../components/ModelEditor'
import { BaseUrlEditor } from '../components/BaseUrlEditor'
import { PreferenceEditor } from '../components/PreferenceEditor'
import { useAiConfigForm } from '../../../lib/ipc/use-ai-config-form'
import { useErrorStore, useUiStore } from '../../../lib/store'
import { toast } from '../../../components/ui/toast'
import type { AiProviderForm } from '@shared/preferences'
import { motion, AnimatePresence } from 'framer-motion'

type AiProvider = AiProviderForm['id']
type ProviderInfo = { id: AiProvider; name: string; models: string[]; hasKey: boolean }

const MODELS: Record<AiProvider, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo', 'MiniMax-M3'],
  claude: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  ollama: ['qwen2.5', 'llama3.1', 'mistral']
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  openai: 'MiniMax-M3',
  claude: 'claude-3-5-sonnet-20241022',
  ollama: 'qwen2.5'
}

const DEFAULT_BASE_URL: Record<AiProvider, string> = {
  openai: 'https://api.minimaxi.com/v1',
  claude: 'https://api.anthropic.com',
  ollama: 'http://localhost:11434'
}

/**
 * 构造与项目相关的"测试连接"prompt:
 *  - 项目已开:用项目里的主角名 + 招呼口吻
 *  - 项目未开:用 generic 但仍然有温度的招呼
 * 两种都让 LLM 写 30 字内的中文招呼,跟实际"AI 面板发消息"风格一致
 *
 * 明确要求"不要内部推理"——某些兼容 provider(minimaxi / deepseek)默认
 * 会先输出 <think>...</think> 块再给最终答案。明确禁止可减少首 token 延迟,
 * 也让流式 UI 干净(展示只看到招呼本身)。
 */
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

import {
  Play,
  Loader2,
  Check,
  X as XIcon,
  ChevronRight,
  Brain
} from 'lucide-react'

/**
 * 拆分 <think>...</think> 块,内部推理以折叠形式展示
 * 流式阶段未闭合的 <think> 自动展开,展开后 think 段字符级 typewriter 同步推进
 */
type Seg = { kind: 'text' | 'think'; content: string }
const splitThink = (raw: string): Seg[] => {
  const segs: Seg[] = []
  const re = /<think>([\s\S]*?)(<\/think>|$)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) segs.push({ kind: 'text', content: raw.slice(last, m.index) })
    segs.push({ kind: 'think', content: m[1] ?? '' })
    last = m.index + m[0].length
    if (!m[2]) {
      last = raw.length
      break
    }
  }
  if (last < raw.length) segs.push({ kind: 'text', content: raw.slice(last) })
  return segs
}

/**
 * Token 估算:CJK 字符 1.5 token/字,非 CJK ~4 字/token
 * (与 AiMessageBubble.estimateTokens 保持一致)
 */
const estimateTokens = (s: string): number => {
  if (!s) return 0
  const cjk = (s.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  const nonCjk = s.length - cjk
  return Math.max(1, Math.round(cjk * 1.5 + nonCjk / 4))
}

// 字符淡出节奏(与主面板一致):45ms/字符 — 让"AI 显得从容"
// 配合 280ms 单字符淡入,整体节奏"自然聊天"感
const PREF_CHAR_DELAY_MS = 45

/**
 * 字符级 typewriter,保留 \n / \n\n 分段
 * - 空行 → 段间距 (h-3 = 12px 间距)
 * - 单 \n → <br>
 * - 每个字符仍走淡入
 */
const renderPrefChars = (s: string, startIndex: number): JSX.Element => {
  const lines = s.split('\n')
  return (
    <>
      {lines.map((line, lineIdx) => (
        <span key={`pl-${startIndex}-${lineIdx}`}>
          {line.length === 0 ? (
            <span className="block h-3" aria-hidden="true" />
          ) : (
            <>
              {Array.from(line).map((ch, chIdx) => {
                const globalIdx = startIndex + lineIdx * 50 + chIdx
                return (
                  <span
                    key={`pc-${globalIdx}-${ch}`}
                    className="inline-block animate-char-fade-in"
                    style={{ animationDelay: `${Math.min(chIdx * 8, 200)}ms` }}
                  >
                    {ch === ' ' ? '\u00A0' : ch}
                  </span>
                )
              })}
              {lineIdx < lines.length - 1 && <br />}
            </>
          )}
        </span>
      ))}
    </>
  )
}

const TestStreamText = ({
  text,
  streaming
}: {
  text: string
  streaming: boolean
}): JSX.Element => {
  const segs = useMemo(() => splitThink(text), [text])
  const totalLen = useMemo(
    () => segs.reduce((acc, s) => acc + s.content.length, 0),
    [segs]
  )
  // P0 修复: 用 ref 跟踪 totalLen,RAF effect 不依赖 totalLen
  // 避免 text 持续 burst 触发 effect 反复 cleanup 重置 lastTickRef
  const totalLenRef = useRef(totalLen)
  useEffect(() => {
    totalLenRef.current = totalLen
  }, [totalLen])
  const [shown, setShown] = useState(0)
  const rafRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(performance.now())

  useEffect(() => {
    if (shown > totalLen) setShown(totalLen)
  }, [totalLen, shown])

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    if (!streaming && shown < totalLenRef.current) {
      setShown(totalLenRef.current)
      return
    }
    if (shown >= totalLenRef.current) return
    lastTickRef.current = performance.now()
    const tick = (): void => {
      const target = totalLenRef.current
      if (target === 0) return
      const now = performance.now()
      if (now - lastTickRef.current >= PREF_CHAR_DELAY_MS) {
        lastTickRef.current = now
        setShown((prev) => Math.min(prev + 1, target))
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  // 只依赖 [streaming, shown] — 不依赖 totalLen(关键)
  }, [streaming, shown])

  let remaining = shown
  let charOffset = 0
  const lastSeg = segs[segs.length - 1]
  const lastIsOpenThink =
    streaming && lastSeg?.kind === 'think' && !text.endsWith('</think>>')

  return (
    <div className="text-sm leading-relaxed text-text min-h-[2rem]">
      {segs.map((s, i) => {
        if (s.kind === 'think') {
          const take = Math.min(s.content.length, remaining)
          remaining -= take
          const isLastUnclosed = i === segs.length - 1 && lastIsOpenThink
          const visibleContent = take > 0 ? s.content.slice(0, take) : ''
          // 标题状态机(关键修复 — 不再猜上限):
          //  - 思考进行中(未闭合):"思考中…",不显示数字(不知道上限)
          //  - 思考已结束(整流结束 OR lastSeg 是 text / 已闭合):"已思考 (N token)"
          //  - 部分 show 但已闭合(网络慢):"思考中… (X / N)"
          const isLastSeg = i === segs.length - 1
          const lastSegIsText = lastSeg?.kind === 'text'
          const isThinkCompleted =
            lastSegIsText ||
            (isLastSeg && !lastIsOpenThink) ||
            (!streaming && take >= s.content.length)
          const label = ((): string => {
            const fullTokens = estimateTokens(s.content)
            const visibleTokens = estimateTokens(visibleContent)
            if (isLastUnclosed) {
              return '思考中…'
            }
            if (!isThinkCompleted) {
              return `思考中… (${visibleTokens} / ${fullTokens} token)`
            }
            return `已思考 (${fullTokens} token)`
          })()
          const block = (
            <div className="mt-1.5 ml-4 pl-3 border-l border-border whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
              {take > 0 ? renderPrefChars(visibleContent, charOffset) : null}
            </div>
          )
          charOffset += take
          return (
            <details
              key={`t-${i}`}
              className="my-1.5 text-xs text-text-muted"
              open={isLastUnclosed}
            >
              <summary className="flex items-center gap-1.5 cursor-pointer select-none hover:text-text transition-colors list-none">
                <ChevronRight className="w-3 h-3 transition-transform [[details[open]_&]_&]:rotate-90" />
                <Brain className="w-3 h-3" />
                <span>{label}</span>
              </summary>
              {block}
            </details>
          )
        }
        const take = Math.min(s.content.length, remaining)
        remaining -= take
        if (take <= 0) return null
        const visible = s.content.slice(0, take)
        const rendered = renderPrefChars(visible, charOffset)
        charOffset += take
        return (
          <span key={`x-${i}`} className="whitespace-pre-wrap">
            {rendered}
          </span>
        )
      })}
    </div>
  )
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

  // form 草稿(用户编辑时的 in-flight 值)
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

  // 测试连接流式状态(从 useAiConfigForm 派生)
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
    // 拿 manifest 里第一个角色(若存在)作为主角
    const mainChar = characters[0]?.name ?? null
    const { prompt, context } = buildTestPrompt(projectName, mainChar)
    void form.testConnection({ provider: current, model, baseUrl, prompt, context })
  }

  const providers = providersQuery.data ?? []
  const currentProvider = providers.find((p) => p.id === current)
  // hasKey:本地 keyMap(form 立即反映)> providersQuery 的 hasKey(stored 反映)
  // 优先级:form.hasKeySync 立即反映(避免 invalidate 间隙)
  const hasKey = form.hasKeySync(current) || currentProvider?.hasKey === true
  const isTesting =
    testState.phase === 'pending' || testState.phase === 'streaming'

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
        <div className="border border-border rounded-2xl p-4 bg-surface space-y-1 divide-y divide-border">
          <PreferenceEditor
            label="API Key"
            description={hasKey ? '已保存。删除后将清空。' : '粘贴服务商的 API Key'}
            vertical
            control={
              <ApiKeyEditor
                hasKey={hasKey}
                onSave={handleKeySaved}
                onDelete={handleKeyDeleted}
              />
            }
          />
          <PreferenceEditor
            label="模型"
            description="从下拉选,或输入自定义模型名"
            control={
              <ModelEditor value={model} options={MODELS[current]} onChange={setModel} />
            }
          />
          <PreferenceEditor
            label="Base URL"
            description="仅在使用代理或本地 Ollama 时修改"
            control={<BaseUrlEditor value={baseUrl} onChange={setBaseUrl} />}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={() => void handleSave()}>保存配置</Button>
        <Button
          variant="secondary"
          onClick={handleTest}
          disabled={isTesting || !hasKey}
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 mr-1" />
          )}
          {isTesting ? '请求中…' : '测试连接'}
        </Button>
      </div>

      {/* 流式响应展示区(替代转圈) */}
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
            {/* 文本展示区:<think>...</think> 块以折叠形式展示(默认折叠,思考中自动展开) */}
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
