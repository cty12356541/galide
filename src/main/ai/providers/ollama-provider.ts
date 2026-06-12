import type { AiRequest, AiChunk } from '../types.js'

export const createOllamaProvider = (baseUrl = 'http://localhost:11434', model = 'qwen2.5') => {
  return {
    name: 'ollama',
    models: ['qwen2.5', 'llama3.1', 'mistral'],
    async generate(req: AiRequest, onChunk: (c: AiChunk) => void): Promise<void> {
      onChunk({ type: 'start' })
      try {
        // 请求级 model 优先(req.model ?? 工厂默认)
        const useModel = req.model ?? model
        const response = await fetch(`${baseUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: useModel,
            prompt: `${req.context}\n\n${req.prompt}`,
            stream: true
          })
        })
        if (!response.ok) {
          onChunk({
            type: 'error',
            error: { code: 'NETWORK', message: `Ollama responded ${response.status}` }
          })
          return
        }
        const reader = response.body?.getReader()
        if (!reader) {
          onChunk({ type: 'end' })
          return
        }
        const decoder = new TextDecoder()
        let buffer = ''
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const json = JSON.parse(line)
              if (json.response) onChunk({ type: 'delta', text: json.response })
            } catch {
              // skip non-JSON
            }
          }
        }
        onChunk({ type: 'end' })
      } catch (err) {
        onChunk({
          type: 'error',
          error: {
            code: 'NETWORK',
            message: err instanceof Error ? err.message : String(err)
          }
        })
      }
    }
  }
}
