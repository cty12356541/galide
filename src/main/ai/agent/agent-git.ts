/**
 * agent-git — 把 git-service 的 snapshot/resetHard 适配成 agent-loop 的 AgentGit 接口
 *
 * 安全闸:任务前 snapshot(git commit 快照),失败 / 取消时 rollback(git reset --hard)。
 * 所有 git 操作仍走 git-service(不直连 simple-git),符合 git_integration 规约。
 */
import { gitService } from '../../git/git-service.js'
import type { AgentGit } from './agent-loop.js'

export const createAgentGit = (projectPath: string): AgentGit => ({
  snapshot: async (label) => {
    const r = await gitService.snapshot(projectPath, label)
    if (r.ok === false) return { ok: false, error: r.error.message }
    return { ok: true, ref: r.value }
  },
  rollback: async (ref) => {
    if (!ref) return { ok: false, error: 'no snapshot ref — rollback skipped' }
    const r = await gitService.resetHard(projectPath, ref)
    if (r.ok === false) return { ok: false, error: r.error.message }
    return { ok: true }
  }
})
