# 决策记录: Critic 闭环语义与 Project Brain 的 canonical 地位

日期: 2026-08-24
状态: 已实施(v0.7 后调整期)

## 背景

深度评估发现两个结构性缺口:

1. Agent 的 critic 看起来存在但并未真正工作——LLM critic 的 JSON verdict 从未被解析,
   确定性 critic 只读单个活跃 .gal 文件,跨文件跳转不可见;修复预算耗尽后 run 仍静默
   返回 done。
2. 长篇创作缺乏"项目大脑":上下文只有角色表/场景索引/git diff,没有伏笔、角色关系、
   路线知识边界等叙事一致性知识,一致性随作品变长必然劣化。

## 决策

### Critic 闭环(2026-08 起)

- **确定性 critic 分析全项目 merged AST**(parseProjectScripts + mergeScriptAsts),
  不再只看活跃文件;跨文件跳转的死路/悬空可被捕获。`analyze_reachability` 工具同步
  支持"省略 fileName = 全项目模式"。
- **LLM critic 的 verdict 被解析**(parseCriticVerdict,容忍 markdown 围栏),
  `pass: false` 的 issues 进入与确定性 critic 相同的修复环,消耗同一份 maxCriticFix
  预算;解析失败标记 parseError,不触发修复。
- **全项目解析失败也进入 critic 阶段**(loadParseFailures),可被修复环处理。
- **步数预算跨修复轮共享**(不再重置);修复轮内耗尽降级为 warning 结束而非回滚。
- **预算耗尽但问题仍在时,run 以 done + warnings 返回**,warnings 透出到 done step
  与任务记录,不再静默通过。

### Project Brain

- `<项目根>/project-brain.json` 是 **canonical、进 Git** 的叙事知识数据,与 `.gal`
  同级;区别于 `.galide/`(机器本地、gitignore)。
- v1 最小三类:foreshadowing(伏笔账本,planted/resolved/abandoned)、
  relationship(角色对键控,阶段历史只追加)、knowledgeBoundary(条件+事实键控,
  防 分支信息泄露)。
- Agent 通过 brain_read(read)与三个 previewable safeWrite 工具读写,走统一确认/diff
  闭环;写入失败显式报错,不静默。
- context engine 以"项目大脑摘要"注入,优先级介于选中场景与角色表之间,受 token 预算
  管理。

### 真实模型 eval 基线

- `pnpm eval:agent`(vitest.eval.config.ts,仅本地):三任务(接线新场景 / 修复死路 /
  brain 登记伏笔)× N 次,确定性 judge 判定,产出成功率/步数/token/耗时/回滚报告到
  `.omo/eval/`(gitignore)。无凭证自动跳过,不进 CI。
- 目的:让"AI 产品能力"可量化,为模型升级提供回归基线。

## 非目标(本期不做)

- eval 进 CI / mock 冒烟回归(agent-mock-e2e 已覆盖框架回归)

## 后续补充(同轮追加)

- Brain 的 renderer 查看面板已落地(BrainPanel,brain:list IPC,右 dock/Meta+6)。
- planCursor 改为**完成标记驱动**:executor prompt 要求在完成当前计划步骤时于回复末尾
  输出 `[STEP_DONE]`,loop 据此推进游标;不再按"一轮工具调用=一步"盲推。进度提示从
  时间性提示变为接近真实的状态机。

## 触发条件与后续

- planCursor 重构待 planner 协议升级时一并处理。
- Brain 扩展(时间线、章节目标、AI 决策记录)待真实项目使用反馈后增量添加,
  schema 已留 version 字段。
