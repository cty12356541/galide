# Changelog

Galide 的版本变更日志。遵循 [Keep a Changelog](https://keepachangelog.com/) 规范。

## [0.5.0] - 2026-06-21

### 新增 — AI Agent 自动化平台

- **Agent 循环(main 中心)** — `agent-loop` 显式状态机 + 依赖注入(FakeLlm/FakeTool 可测);挂在独立 agent 队列,经 `ai:agent:*` IPC 驱动
- **可切换自主模式** — `agentAutonomy`: copilot / hybrid / autonomous;`autonomy-gate` risk×mode 真值表,循环主体不随模式分支
- **可切换拓扑** — `agentTopology`: singleReact / litePlanExecute(默认) / planExecuteCritic;Planner 结构化计划 + 确定性可达性 Critic
- **Context Engine** — 角色表 + 场景索引 + 选中场景 + git diff,带 token 预算
- **Tool Registry** — schema 校验 + risk/domain;只读/安全写剧本工具;多模态(generate_sprite/voice);`dispatch_command` 暴露 CommandId
- **安全闸** — 任务前 git snapshot、失败 reset 回滚、destructive 工具 `ai:agent:confirm` 往返
- **image-proxy** — SD / DALL-E / ComfyUI(完整 workflow:提交+轮询 history+/view);CharacterCard.sdPrompt 独立于 spriteSet.path
- **tts-proxy** — Edge TTS + ElevenLabs REST(可注入 fetchFn);读取 VoicePreferences 与 voiceConfig.voiceId
- **Agent 模式 UI** — AiPanel 对话/Agent 双 tab;步骤流 + autonomy/topology 切换器

### IPC 协议

- `ai:agent:start` / `cancel` / `step` / `status` / `confirmRequest` / `confirm`
- `agent:dispatchCommand` / `agent:dispatchResult` — main→renderer 命令投递

### 测试

- 45 个测试文件 / 368 个测试全过(agent-loop / gate / topology / image-proxy / tts-proxy / command-dispatcher 等)

## [0.4.0] - 2026-06-17

### 新增

- **PyCharm 组件岛布局** — Menu Bar / Toolbar / Project Tabs 三层顶栏
- **LeftToolWindow** — PyCharm 风格左侧工具窗口(项目 / Git 双标签)
- **Mosaic 中区** — `react-mosaic-component@6` 集成,ScriptEditor / FlowView /
  PreviewCanvas 三 panel 拖拽组合
- **Mosaic 树持久化** — 独立 `electron-store`(`galide-mosaic` namespace),
  800ms debounce 写盘,启动期 read 一次
- **浮出 BrowserWindow** — 5 个 panel(script / flow / preview / left-tool / ai)
  都能浮出为独立 OS 窗口
  - 主窗口槽位自动隐藏
  - 关闭浮出窗口自动恢复布局
  - "返回主窗口" 按钮快速聚焦
  - 浮出上限 3 个(防误操作)
- **脏数据 UI 警告** — mosaic 持久化文件被破坏时 toast 提示
- **快捷键** — `⌘K` 命令面板 / `⌘,` 偏好 / `⌘L` AI 开关 / `⌘1` Project 开关 /
  `⌘E` 导出 / `⌘N` 新建 / `⌘⇧C` Git 提交

### 重构

- 删 `workspaceLayout` 嵌套对象 + 3 个 useEffect(hydrate / persist /
  beforeunload flush)+ 3 个 useRef 兼容
- 简化 `useUiStore` 5 个标量字段(替代 `workspacePreset` 嵌套 layout)
- 抽 `usePanelFloat` / `useMosaicPersistence` 共享 hook
- 拆 `sanitizeTree` + `sanitizeTreeWithResult`(后者带 `repaired` 标记)

### IPC 协议

- `workspace:openPanel` — 浮出 panel(走 zod `WorkspaceOpenPanelSchema` 校验)
- `workspace:panelClosed` — 浮出窗口关闭通知(自动同步 store)
- `workspace:focusMain` — 浮出窗口请求聚焦主窗口
- `workspace:mosaic:read` / `workspace:mosaic:write` — mosaic 树持久化
- 所有新 handler 入口走 zod schema,失败透传 `SCHEMA_FAILED` code

### 测试

- 21 个测试文件 / 171 个测试全过
- 新增覆盖:FloatingPanelHost / LeftToolWindow / mosaic sanitize /
  usePanelFloat / useMosaicPersistence

### 已知限制

- 导出目标:Web ✅ / JSON ✅ / Ren'Py / Ink / Electron-desktop ⏳(stub)
- 多窗口 IPC sync 仅 export progress 按发送者路由
- e2e 测试需本地 GUI 环境跑

## [0.3.0] - 之前

- AI 视觉/听觉(角色立绘、语音生成)
- 详见 git history

## [0.2.0] - 之前

- AI 文案与逻辑(OpenAI / Claude / Ollama,流式输出)
- 详见 git history

## [0.1.0] - 之前

- IDE 编辑体验(CodeMirror + React Flow + PixiJS 预览)
- 详见 git history
