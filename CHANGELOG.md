# Changelog

Galide 的版本变更日志。遵循 [Keep a Changelog](https://keepachangelog.com/) 规范。

## [0.6.0] - 2026-06-22

### 新增 — 嵌套条件编辑 + Agent 变量工具 + 预览存档

- **BeatCardEditor** — 条件块分支内完整嵌套 beat 编辑(expand/collapse、缩进层级);`group-beats` / `beat-locator` 纯函数单测
- **Agent 工具** — `set_variable` / `add_conditional_block` / `add_gated_choice` / `read_variables`;`scan-variables` AST 扫描;memfs 往返测试
- **预览存档** — `.galide/saves/slot-{n}.json` 三槽 save/load(PreviewCanvas chrome);Web 导出 localStorage 同形 VmState;`vm-save` round-trip 测试

### 新增 — 变量 + 条件分支 DSL 全链路

- **DSL** — `设:` 变量赋值/增减; `[若:]` / `[否则若:]` / `[否则]` / `[若终]` 条件块; 选项 `[当: expr]` 门控; `Expression` AST + 安全求值器(`shared/dsl/expression.ts`); parser/serializer/visitor 往返测试
- **预览 VM** — `runtime-vm.ts` 运行时求值条件、应用 set 步骤、过滤门控选项、解析 if 分支; Web 导出内联同一求值/VM 函数( parity 测试)
- **编辑器** — BeatCardEditor 设变量卡 / 条件块卡 / 选项条件字段; FlowView 条件边虚线 + 条件标签

## [0.5.0] - 2026-06-21

### 新增 — 预览保真度 Preview Fidelity (Phases 1–3)

- **Phase 1 — 立绘 + 有序播放** — `shared/preview/playback-timeline.ts` 按 `scene.children` 文档序产出 dialogue/choice/goto/marker 步骤;PixiJS 立绘层(left/center/right)持久至下次变更;预览游标推进全部 beat 类型
- **Phase 2 — BGM** — `preview-audio.ts` Web Audio 播放 `SceneNode.bgm`,场景切换 crossfade;预览 chrome 暴露静音/音量(语音/TTS 仍仅在 Voice 面板)
- **Phase 3 — 共享 VM + Web 导出 parity** — `shared/preview/runtime-vm.ts` 标记注册表、goto/marker/choice 跳转(场景 ID 或 marker ID);`$variable` 仅 scaffold( AST 尚无 variable 节点);Web 导出播放器内联同一 VM 函数 + 立绘渲染

### 新增 — 工作区预设 declarative 布局(B2)

- **`workspace-presets.ts`** — 写作 / 流程 / 评审三预设含 `visiblePerSide`、`activeSubIsland`、`editorCoreLayout`、`previewOpen` 默认值
- **`applyWorkspacePreset`** — 切预设时快照 outgoing 布局至 `layoutsByPreset[prev]` 并恢复 target(首访用默认)
- **`EditorCore`** — 分栏比例读 `store.editorCoreLayout`,`onLayout` 写回 store
- **F5 / 运行预览** — 快捷键、MenuBar、command handler 统一 `applyWorkspacePreset('review')` + `setPreviewOpen(true)`
- **持久化** — `use-workspace-persistence` 扩展 `{ lastPreset, layoutsByPreset, editorCoreLayout }`;开项目时 `setProject` 重应用全局预设

### 新增 — 卡片 / 源码主编辑面(C1)

- **`EditorSurfaceTabs`** — 卡片(默认) | 源码 tabs;源码内嵌 `ScriptEditor`(embed),保留浮出
- **`useScriptSave`** — 卡片/源码统一 debounce 800ms autosave;⌘S 立即 flush;切换至源码前 flush 待存
- **`editorSurface`** store 字段;⌘Z / ⌘F 按活跃面路由(CodeMirror vs 卡片撤销栈)

### 修复 — UX 审计「控件说真话」(10 项 quick wins)

- **预览开关与 store 同步** — `EditorCore` 读写 `useUiStore.previewOpen`,F5 / 菜单 / `togglePreview` 命令真正展开底栏预览
- **预览 beat 文档序** — `buildPreviewItems` 按 `scene.children` 顺序交错对白/选项(对齐 `BeatCardEditor.groupBeats`)
- **Agent 确认 diff** — 面板内展示 `pendingConfirm.diff` 变更前后预览(非编辑器 inline)
- **Agent 读当前剧本** — `activeScriptFile` 经 IPC 传入 main,工具与 critic 读用户正在编辑的 `.gal`
- **AI 内联错误 + Key CTA** — Agent / 对话失败时在面板内显示横幅,一键 `openPreferences('ai')`
- **状态栏错误 Popover** — 错误计数可点击,列出 `useErrorStore` 条目并支持 dismiss
- **Activity Bar 去占位** — 隐藏 search/debug 死胡同;设置按钮直接打开偏好
- **状态栏真实 Git 分支** — 经 `useGitStatus` 显示当前分支名
- **大纲来自 AST** — `OutlinePanel` 从 `scriptAst` 派生场景列表,点击选中场景
- **诊断点击跳转** — `DiagnosticsPanel` 点击条目浮出原始编辑器并滚动到行/列

### 修复 — AI Agent / TTS Bugbot 审查

- **agent 写 .gal 后广播 script:changed** — `createBroadcastingWriteFile` 复用 IPC 层广播机制,全部窗口(含发起 agent 的窗口)收到最新剧本,避免 stale 内存覆盖 agent 修改
- **git snapshot 失败时中止 agent** — 无有效回滚点时不再继续执行,避免 rollback 误 `resetHard` 到 HEAD 抹掉用户未提交编辑
- **agent LLM 使用配置的 baseUrl** — `AgentStartRequest.baseUrl` / `aiConfig.baseUrl` 经 `createLlmAdapter` 注入 chat 请求(兼容 MiniMax 等 OpenAI 代理)
- **取消信号传入 llm.chat** — `runAgent` 的 `AbortSignal` 转发至 planner / executor / critic 各阶段
- **TTS preview 使用 os.tmpdir()** — 替换硬编码 `/tmp`,Windows 可用

### 新增 — AI Agent 自动化平台

- **ElevenLabs API Key 录入** — 偏好设置「语音 / TTS」面板支持 ElevenLabs Key 的保存/删除/状态查询,经现有 `ai:keySet/keyDelete/keyHas` IPC 加密落盘,供 `tts-proxy` 读取
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

- 67 个测试文件 / 487 个测试全过(nested beat / agent variable tools / vm-save parity 等)

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
