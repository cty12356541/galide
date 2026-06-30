/**
 * AgentModePanel — agent 步骤流 + autonomy/topology 切换
 */
import { useEffect, useState } from 'react'
import { Bot, Loader2, Square } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { ScrollArea } from '../../components/ui/scroll-area'
import { useUiStore } from '../../lib/store'
import { AiErrorBanner } from '../../lib/ai-error-banner'
import { useAgent, useAgentRun, type AgentStep } from '../../lib/ipc/use-agent'
import { useAiConfig } from '../../lib/ipc/use-ai-task'
import { type CriticReport } from '../../lib/ipc/use-agent'
import { AgentConfirmDiff } from './agent-confirm-diff'
import type { AgentPreferences } from '@shared/preferences'

type Mode = AgentPreferences['autonomy']
type Topology = AgentPreferences['topology']

export const StepView = ({ step }: { step: AgentStep }): JSX.Element => {
  switch (step.type) {
    case 'plan':
      return (
        <div className="text-xs space-y-1">
          <div className="font-medium text-accent">计划</div>
          {step.plan.steps.map((s) => (
            <div key={s.index}>
              {s.index}. {s.description}
            </div>
          ))}
        </div>
      )
    case 'thought':
      return <div className="text-xs text-text-muted whitespace-pre-wrap">{step.text}</div>
    case 'awaiting_confirm':
      return <div className="text-xs text-text-muted">⏸ 等待确认: {step.call.name}</div>
    case 'tool_call':
      return (
        <div className="text-xs">
          <span className="text-accent">工具</span> {step.call.name}{' '}
          <span className="text-text-muted">({step.risk}/{step.decision})</span>
        </div>
      )
    case 'tool_result':
      return (
        <div className="text-xs text-text-muted">
          → {step.result.name}: {step.result.content.slice(0, 120)}
        </div>
      )
    case 'critic': {
      const r = step.report as CriticReport
      if (r.kind === 'deterministic') {
        const rc = r.reachability
        return (
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-accent">审查 · 可达性</div>
            <div className="text-text-muted">入口: {rc.entry ?? '(无)'}</div>
            <div className="text-text-muted">
              不可达: {rc.unreachable.length > 0 ? rc.unreachable.join(', ') : '无'}
            </div>
            <div className="text-text-muted">
              悬空跳转:{' '}
              {rc.danglingTargets.length > 0
                ? rc.danglingTargets.map((d) => `${d.from}→${d.target}`).join(', ')
                : '无'}
            </div>
          </div>
        )
      }
      return (
        <div className="text-xs space-y-0.5">
          <div className="font-medium text-accent">审查</div>
          <div className="text-text-muted whitespace-pre-wrap">{r.text}</div>
        </div>
      )
    }
    case 'done':
      return <div className="text-sm whitespace-pre-wrap">{step.text}</div>
    case 'error':
      return <div className="text-xs text-danger">{step.message}</div>
  }
}

export const AgentModePanel = (): JSX.Element => {
  const projectPath = useUiStore((s) => s.projectPath)
  const activeScriptFile = useUiStore((s) => s.activeScriptFile)
  const selectedSceneId = useUiStore((s) => s.selectedSceneId)
  const agent = useAgent()
  const config = useAiConfig()
  const [goal, setGoal] = useState('')
  const [taskId, setTaskId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [autonomy, setAutonomy] = useState<Mode>('hybrid')
  const [topology, setTopology] = useState<Topology>('litePlanExecute')
  const [memoryEnabled, setMemoryEnabled] = useState(true)
  const run = useAgentRun(taskId)

  useEffect(() => {
    void window.galide.preferences.get('agent').then((v) => {
      const prefs = v as AgentPreferences | undefined
      if (prefs?.autonomy) setAutonomy(prefs.autonomy)
      if (prefs?.topology) setTopology(prefs.topology)
      if (prefs?.memoryEnabled !== undefined) setMemoryEnabled(prefs.memoryEnabled)
    })
  }, [])

  const persistAgentPrefs = async (next: Partial<AgentPreferences>): Promise<void> => {
    const current = (await window.galide.preferences.get('agent')) as AgentPreferences
    const merged = { ...current, ...next }
    if (next.autonomy) setAutonomy(next.autonomy)
    if (next.topology) setTopology(next.topology)
    if (next.memoryEnabled !== undefined) setMemoryEnabled(next.memoryEnabled)
    await window.galide.preferences.set('agent', merged)
  }

  useEffect(() => {
    if (run.status === 'done' || run.status === 'error' || run.status === 'cancelled') {
      setBusy(false)
    }
  }, [run.status])

  const onStart = async (): Promise<void> => {
    if (!goal.trim() || !projectPath || busy) return
    setBusy(true)
    setStartError(null)
    const r = await agent.start({
      goal: goal.trim(),
      projectPath,
      activeScriptFile,
      selectedSceneId,
      provider: config.data?.provider,
      model: config.data?.model,
      baseUrl: config.data?.baseUrl
    })
    if (r?.ok && r.taskId) {
      setTaskId(r.taskId)
    } else {
      setBusy(false)
      setStartError(r && 'error' in r ? r.error : 'Agent 启动失败')
    }
  }

  const onConfirm = async (approved: boolean): Promise<void> => {
    if (!run.pendingConfirm) return
    await agent.confirm(run.pendingConfirm.confirmId, approved)
    run.clearConfirm()
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="border-b border-border p-2 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Bot className="w-3.5 h-3.5 text-accent" />
          <span className="font-medium">Agent 模式</span>
          {busy && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
        </div>
        <div className="flex gap-2 text-[10px]">
          <label className="flex items-center gap-1">
            自主
            <select
              className="bg-bg border border-border rounded px-1 py-0.5"
              value={autonomy}
              onChange={(e) => void persistAgentPrefs({ autonomy: e.target.value as Mode })}
            >
              <option value="copilot">逐步确认</option>
              <option value="hybrid">混合</option>
              <option value="autonomous">全自动</option>
            </select>
          </label>
         <label className="flex items-center gap-1">
           拓扑
           <select
             className="bg-bg border border-border rounded px-1 py-0.5"
             value={topology}
             onChange={(e) => void persistAgentPrefs({ topology: e.target.value as Topology })}
           >
             <option value="singleReact">单循环</option>
             <option value="litePlanExecute">计划+执行</option>
             <option value="planExecuteCritic">+审查</option>
           </select>
         </label>
         <label className="flex items-center gap-1">
           记忆
           <input
             type="checkbox"
             checked={memoryEnabled}
             onChange={(e) => void persistAgentPrefs({ memoryEnabled: e.target.checked })}
           />
         </label>
       </div>
        {startError ? <AiErrorBanner message={startError} preferencesSection="ai" /> : null}
      </div>
      <ScrollArea className="flex-1 p-2">
        <div className="space-y-2">
          {run.steps.map((s, i) => (
            <div key={i} className="rounded-md border border-border/60 bg-canvas px-2 py-1.5">
              <StepView step={s} />
            </div>
          ))}
          {run.error ? <AiErrorBanner message={run.error} preferencesSection="ai" /> : null}
        </div>
      </ScrollArea>
      {run.pendingConfirm ? (
        <div className="border-t border-border p-2 space-y-2 bg-bg-elevated">
          <div className="text-xs">
            确认执行工具 <strong>{run.pendingConfirm.call.name}</strong> ({run.pendingConfirm.risk})?
          </div>
          {run.pendingConfirm.diff ? (
            <AgentConfirmDiff
              before={run.pendingConfirm.diff.before}
              after={run.pendingConfirm.diff.after}
            />
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" variant="default" onClick={() => void onConfirm(true)}>
              允许
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onConfirm(false)}>
              拒绝
            </Button>
          </div>
        </div>
      ) : null}
      <div className="border-t border-border p-2 space-y-2">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="描述 agent 要完成的任务…"
          rows={2}
          disabled={busy || !projectPath}
          className="w-full text-sm rounded-md border border-border bg-canvas px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-accent/25"
        />
        <div className="flex justify-end gap-2">
          {busy && taskId ? (
            <Button size="sm" variant="outline" onClick={() => void agent.cancel(taskId)}>
              <Square className="w-3 h-3 mr-1" />
              停止
            </Button>
          ) : null}
          <Button size="sm" disabled={!goal.trim() || !projectPath || busy} onClick={() => void onStart()}>
            运行 Agent
          </Button>
        </div>
      </div>
    </div>
  )
}
