/**
 * key-resolve — LLM apiKey 解析(纯函数,跨 agent 适配器与 provider 共用)
 *
 * 本地网络映射端点(vLLM / LM Studio / Ollama /v1 等)通常不校验鉴权,
 * 但 OpenAI/Anthropic SDK 构造时强制要求 apiKey 非空。
 * 约定:无存储 key 但使用自定义 baseUrl(本地映射)时用占位符绕过 SDK 校验;
 * 无 key 且官方端点 → 抛错(调用方决定如何回报)。
 */
export const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1'
export const DEFAULT_CLAUDE_BASE = 'https://api.anthropic.com'
const LOCAL_KEY_PLACEHOLDER = 'sk-galide-local'

export const resolveApiKey = (
  storedKey: string | undefined,
  baseUrl: string | undefined,
  defaultBase: string
): string => {
  if (storedKey) return storedKey
  if (baseUrl && baseUrl !== defaultBase) return LOCAL_KEY_PLACEHOLDER
  throw new Error('未配置 API Key(本地网络映射端点可省略 key,但需设 BaseUrl)')
}
