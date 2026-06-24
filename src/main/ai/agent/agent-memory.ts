/**
 * agent-memory — 项目级跨会话记忆(.galide/agent-memory.json)
 *
 * 记录最近 N 轮 agent 运行的 { goal, finalText, status, timestamp },
 * 让新 run 能看到先前结论,而非每次从零开始(messages: [])。
 *
 * 设计:
 *   - 存储走 ToolFs 接口(与 script/manifest 工具同构,测试用 memfs 注入)
 *   - 容量环截断(FIFO),默认 8 条
 *   - 写入失败静默(记忆是增强而非关键路径,不阻断 agent 运行)
 *   - .galide/ 已在 .gitignore(机器本地状态,不入版本控制)
 */
import { join } from 'node:path'

export const AGENT_MEMORY_DIR = '.galide'
const MEMORY_FILE = 'agent-memory.json'

export interface MemoryEntry {
  goal: string
  finalText: string
  status: 'done' | 'error' | 'cancelled'
  timestamp: string
}

export interface AgentMemory {
  entries: MemoryEntry[]
}

export interface MemoryFs {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  mkdir?: (path: string, options?: { recursive?: boolean }) => Promise<unknown>
}

export const memoryPath = (projectPath: string): string =>
  join(projectPath, AGENT_MEMORY_DIR, MEMORY_FILE)

/** 读记忆;不存在 / 损坏 → 空记忆(不抛错) */
export const readMemory = async (projectPath: string, fs: MemoryFs): Promise<AgentMemory> => {
  try {
    const raw = await fs.readFile(memoryPath(projectPath))
    const parsed = JSON.parse(raw) as AgentMemory
    if (!Array.isArray(parsed.entries)) return { entries: [] }
    return { entries: parsed.entries.slice(-50) }
  } catch {
    return { entries: [] }
  }
}

/** 追加一条运行记录并环截断到 capacity */
export const appendMemory = async (
  projectPath: string,
  entry: MemoryEntry,
  fs: MemoryFs,
  capacity = 8
): Promise<void> => {
  try {
    if (fs.mkdir) await fs.mkdir(join(projectPath, AGENT_MEMORY_DIR), { recursive: true })
    const current = await readMemory(projectPath, fs)
    const entries = [...current.entries, entry].slice(-capacity)
    await fs.writeFile(memoryPath(projectPath), JSON.stringify({ entries }, null, 2))
  } catch {
    // 记忆写入失败不阻断 agent(增强而非关键路径)
  }
}

/** 把记忆格式化为上下文文本(给 context-engine 注入用) */
export const formatMemoryText = (memory: AgentMemory): string => {
  if (memory.entries.length === 0) return ''
  const lines = memory.entries.map((e) => {
    const head = `- [${e.status}] ${e.goal}`
    return e.finalText ? `${head} → ${e.finalText.slice(0, 280)}` : head
  })
  return lines.join('\n')
}
