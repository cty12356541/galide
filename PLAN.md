# Galide 规约驱动修复计划

> 制定时间: 2026-06-12
> 上游依据: 深度一致性检查报告 (subagent `16c7f650-...`)
> 规约源: `.style-spec/`(core > layers > languages) + `.cursor/rules/`
> 修复原则: 偏离点按"违反哪层规约"分类,优先级 `core` > `layers` > `languages`

---

## 0. 修复排序原则(规约视角)

每个修复项附带**规约级别**标签:

- **[CORE]** — 违反 `.style-spec/core/`(canonical artifact、AI 哲学、Git-as-VCS、命名映射、模式)
- **[LAYER]** — 违反 `.style-spec/layers/`(main/renderer/dsl 层约定)
- **[FILE]** — 文件/代码级小问题(死代码、缺 lint、tsconfig 冗余)
- **[SPEC-ADD]** — 规约本身需要补全(新增 `.mdc`、补 `conventions.yaml` 行)
- **[SPEC-REMOVE]** — 规约和实现冲突,需要更新规约(规约过度细分)

ROI = 违反层级权重 × 业务影响。

---

## 1. 已采纳的修复项(规约视角重新定级)

### 🔴 P0 — 全部 [CORE] 级别,影响核心哲学或产品可用

#### P0-1 [CORE: ai_integration.streaming] 修复 AI 流式断链
- **规约依据**: `core/conventions.yaml:21` "AI 响应使用 SSE,renderer 端打字机展示";`layers/main-process/conventions.yaml:22-26` ai_proxy 块(流式通过 RendererEvent 推送)
- **现状**: `main/ai/ai-handlers.ts:31` 硬编码 `'[streamed, see ai:stream events]'`,`preload/index.ts` 未暴露 `ai:stream` 监听
- **修复**:
 1. `src/preload/index.ts` — 在 `ai` 命名空间下暴露 `stream: (cb) => ipcRenderer.on(IPC.ai.stream, (_, chunk) => cb(chunk))`,返回 unsubscribe
 2. `src/renderer/src/lib/ipc/use-ai.ts` — 新增 `useAiStream(taskId): { text, done, error }` hook
 3. `src/main/ipc/ai-handlers.ts` — 删除硬编码字符串,改用 `sender.send(IPC.ai.stream, { taskId, delta })` 逐 token 推送
 4. `src/renderer/src/features/ai-panel/AiPanel.tsx:47-56` — 改为订阅流,逐 delta append 到 message
- **验收**: 输入 AI 续写请求,面板逐 token 出现文本
- **影响文件**: 4 个

#### P0-2 [CORE: canonical_artifact] 重新定义 `.galproj` 边界
- **规约依据**: `core/conventions.yaml:5` ".gal 文件是决策树的 Canonical 表示"
- **现状**: `ProjectManifest.scenes: SceneMetadata[]`(`shared/types.ts:40`)把决策树衍生元数据写进 `.galproj`,导致**决策树在两处存在**
- **修复**:
 1. `src/shared/types.ts` — 从 `ProjectManifest` 删除 `scenes` 字段
 2. `src/main/ipc/project-handlers.ts:35-64` — 移除 `scenes` 读写相关分支
 3. `src/main/store/manifest.ts`(若存在)或对应读写点同步清理
 4. `src/renderer/src/lib/ipc/use-project.ts` — UI 列表不再依赖 manifest.scenes,改用 `use-script.ts` 列出 `.gal` 文件
 5. `src/main/store/project.ts`(如存在)清理
- **验收**: 项目根 `.galproj` 文件不含 scenes 字段,场景列表通过扫描 `.gal` 派生
- **影响文件**: 3-5 个

#### P0-3 [CORE: git_operations.init+commit] 落地"新建项目自动 init"和"保存自动 commit"
- **规约依据**: `core/conventions.yaml:24-31` git_integration;"新建项目时自动 git init" + "保存时自动 add + commit";`layers/main-process/conventions.yaml:28-32` "所有操作通过 src/main/git/git-service.ts"
- **现状**:
 - 缺失 `src/main/git/git-service.ts`,git 逻辑直接写在 `main/ipc/git-handlers.ts`
 - `project-handlers.ts` 没在 create 后自动 `git:init`
 - `script-handlers.ts:write` 写完没触发 commit
 - 偏好 `autoCommitOnSave` 没人消费
- **修复**:
 1. **新建** `src/main/git/git-service.ts` — 封装 `simpleGit` API(`init` `status` `add` `commit` `log` `diff`),按规约要求单独模块
 2. `src/main/ipc/git-handlers.ts` — 改为薄壳,只做 IPC 转发到 `git-service`
 3. `src/main/ipc/project-handlers.ts:create` — create 成功后调 `gitService.init(projectPath)` + `gitService.commit('initial commit')`
 4. `src/main/ipc/script-handlers.ts:write` — 写完后检查 `usePreferences().autoCommitOnSave`,true 则 `gitService.add('chapter1.gal') + commit('update: <fileName>')`
- **验收**: 创建新项目后 `git log` 看到 initial commit;每次保存脚本 `git log` 多一条 commit
- **影响文件**: 新建 1 个 + 修改 3 个

---

### 🟡 P1 — [CORE]/[LAYER] 混合,影响规约完整性

#### P1-1 [CORE: naming] 补齐核心命名类型
- **规约依据**: `core/naming.yaml` 业务实体 → 类型映射
- **缺失类型**: `PlayerChoice`、`Branch`、`Asset`、`AssetFile`、`AssetIndex`、`ProjectRoot`、`ProjectFile`、`CharacterAsset`、`SceneAsset`、`DialogueChoice`
- **现状**: 代码用 `ChoiceOption` 统一表达 `Choice`+`PlayerChoice`+`Branch`;资产全部裸字符串;`SpriteEntry` 偏离 `CharacterSprite` 命名
- **修复策略**: **采用 [SPEC-REMOVE] 思路,在 `core/naming.yaml` 中补充别名,避免破坏性重构**
 1. `src/shared/types.ts` 增加 `type PlayerChoice = ChoiceOption`、`type Branch = ChoiceNode`、`type CharacterAsset = { id, kind, path }` 等别名
 2. `src/shared/types.ts` 增加 `Asset` `AssetFile` `AssetIndex` 类型(占位即可,先满足命名)
 3. `src/shared/types.ts` 重命名 `SpriteEntry` → `CharacterSprite` (保留 alias 兼容)
 4. 同步更新所有引用 `SpriteEntry` 的文件
- **验收**: `rg "PlayerChoice|Branch|CharacterSprite|AssetFile|AssetIndex"` 在 `src/` 下能找到定义
- **影响文件**: 2-4 个

#### P1-2 [CORE: patterns.ast_visitor] 实现 AST Visitor 模式
- **规约依据**: `core/patterns.yaml:26-34` 显式定义 `ScriptVisitor<T>` 接口
- **现状**: 完全没有 visitor 模块,`FlowView.tsx:18-65` 和 `PreviewCanvas.tsx:12-24` 手写 `for/of` 遍历
- **修复**:
 1. **新建** `src/shared/dsl/visitor.ts`:
 ```ts
 export interface ScriptVisitor<T> {
   visitScript(node: ScriptNode): T
   visitScene(node: SceneNode): T
   visitDialogue(node: DialogueNode): T
   visitChoice(node: ChoiceNode): T
   visitGoto(node: GotoNode): T
   visitMarker(node: MarkerNode): T  // 如有
   visitComment(node: CommentNode): T  // 如有
 }
 export function walkScript<T>(ast: ScriptNode, visitor: ScriptVisitor<T>): T
 export const collectNodes = (ast: ScriptNode, predicate: (n: Node) => boolean): Node[]
 export const countByType = (ast: ScriptNode): Record<NodeType, number>
 ```
 2. `src/renderer/src/features/flow-view/FlowView.tsx` — 改用 `walkScript`
 3. `src/renderer/src/features/preview/PreviewCanvas.tsx` — 改用 `walkScript`
- **验收**: 任何"遍历决策树"代码都走 `walkScript`,手写 `for/of` 只在 visitor 内部出现
- **影响文件**: 新建 1 个 + 修改 2 个

#### P1-3 [LAYER: main-process.export_pipeline] 补全 Export Composer 模式
- **规约依据**: `core/patterns.yaml:6-15` Parser-Composer Pipeline;"正交";`core/conventions.yaml:35` "gal AST → TargetAST → TargetFile"
- **现状**: 4 个目标 throw,web exporter 写死内联 HTML
- **修复**:
 1. **新建** `src/main/export/composer.ts`:
 ```ts
 export interface Composer<TAst, TOut> {
   name: ExportTarget  // 'web' | 'renpy' | 'ink' | 'json' | 'electron-desktop'
   transform(ast: ScriptAST): TAst
   emit(target: TAst): TOut  // string | { path, content }[]
 }
 export function composeExport<T>(ast: ScriptAST, composer: Composer<T, string>): Promise<ExportResult>
 ```
 2. **新建** `src/main/export/web-composer.ts` — 把现有 `web.ts` 的 HTML 模板抽成 `WebComposer`
 3. **新建** `src/main/export/renpy-composer.ts` `ink-composer.ts` `json-composer.ts` 三个 stub composer(返回空字符串 + TODO,符合规约"所有目标都通过 Composer 暴露")
 4. `src/main/ipc/export-handlers.ts:11-13` — 删 throw,改为查 composer registry
 5. `src/main/export/index.ts`(新建)— composer 注册表
- **验收**: `export-handlers.ts` 不再 throw;`src/main/export/` 下 5 个 composer 文件齐备
- **影响文件**: 新建 5 个 + 修改 1 个

#### P1-4 [LAYER: renderer.ipc_abstraction] 新增 `useAiStream` 和补全 spec 钩子集
- **规约依据**: `layers/renderer/conventions.yaml:24-30` 显式列出 `useAiTask()` 等钩子;`layers/renderer/conventions.yaml:19-22` "每个 IPC 通道有对应 hook"
- **现状**: 流式监听没 hook(已 P0-1 修);其他 hook 完整
- **修复**:
 1. `src/renderer/src/lib/ipc/use-ai.ts` — 新增 `useAiStream(taskId)`(在 P0-1 步骤 2 一并实现)
 2. 确认所有 `IPC.ai.*` 通道都有 hook(`generate` `cancel` `listTasks` 等)
- **影响文件**: 1 个

#### P1-5 [CORE: ai_integration.task_queue] 实现 AI 任务队列
- **规约依据**: `core/conventions.yaml:22` "AI 任务入队,UI 显示排队状态,不阻塞编辑器操作"
- **现状**: `ai-handlers.ts` `await aiProxy.generate(...)` 同步等待,无队列
- **修复**:
 1. **新建** `src/main/ai/task-queue.ts` — 简单 FIFO + 状态(`pending` `running` `done` `error`),支持并发=1
 2. `src/main/ipc/ai-handlers.ts` — 改为 `queue.enqueue(req)` 不 await,立即返回 `taskId`
 3. **新建** IPC `ai:status`(`shared/ipc-channels.ts`),`queue` 状态变化时 `sender.send`
 4. `src/renderer/src/lib/ipc/use-ai.ts` — 新增 `useAiTaskStatus(taskId)`,订阅 `ai:status`
 5. `src/renderer/src/features/ai-panel/AiPanel.tsx` — 用 `useAiTaskStatus` 显示 pending/running/done 状态
- **验收**: 并发触发 2 个 AI 任务,第二个显示 pending,第一个完成后第二个自动 running
- **影响文件**: 新建 1 个 + 修改 4 个

---

### 🟢 P2 — [FILE] 级别,规约系统维护

#### P2-1 [FILE] 修复 `getGit` 死代码
- `src/main/ipc/git-handlers.ts:18-24` `try/catch` 包 `simpleGit()` 不会抛(SimpleGit 创建不抛),改用 `simpleGit.create(projectPath)` 直接返回
- **影响文件**: 1 个

#### P2-2 [FILE] 删 `pnpm-workspace.yaml`
- 单包项目,文件冗余
- **影响文件**: 1 个

#### P2-3 [FILE] 加 ESLint 配置
- `package.json:scripts.lint` 是 `eslint .` 但 devDependencies 没 `eslint`,`.eslintrc*` 也没
- 加 `@typescript-eslint/parser` `@typescript-eslint/eslint-plugin` + `.eslintrc.cjs`
- **影响文件**: 2 个

#### P2-4 [SPEC-ADD] 新增 `.cursor/rules/ai-conventions.mdc`
- 把 `core/conventions.yaml:18-22` 散落的 AI 规约沉淀成 alwaysApply 规则
- 重点: Key 不离开 main / 流式走 `ai:stream` / 错误用 `AiError` 结构
- **影响文件**: 1 个

#### P2-5 [SPEC-ADD] 新增 `.cursor/rules/git-workflow.mdc`
- 把 `core/conventions.yaml:24-31` 沉淀,加上"自动 commit 触发约定"
- **影响文件**: 1 个

#### P2-6 [SPEC-ADD] 补全 `core/conventions.yaml` 关于 `.galproj` 的说明
- 在 `project_structure` 块下加:
 ```yaml
 project_files:
   ".galproj": "项目元数据(角色卡、资产路径、git 配置);决策树不在此处"
   ".gal": "决策树 Canonical 表示,所有导出从此派生"
   "electron-store": "全局 UI 状态(偏好、Key、最近项目)"
 ```
- **影响文件**: 1 个

#### P2-7 [SPEC-ADD] 在重复的 `.mdc` 规则顶部加 provenance 注释
- `typescript-conventions.mdc` / `dsl-conventions.mdc` / `react-conventions.mdc` 与 `.style-spec` 重复
- 每份加 "本文件镜像 `.style-spec/...`,修改请同步"
- **影响文件**: 3 个

#### P2-8 [FILE] 升级 `@anthropic-ai/sdk` 依赖
- `package.json:dependencies` 的 `@anthropic-ai/sdk@^0.30.0` 偏旧
- 升级到最新(实际版本由 npm 决定,避免瞎编)
- **影响文件**: 1 个

#### P2-9 [FILE] `electron-builder.yml` 签名/构建资源
- `directories.buildResources: build` 但无 `build/` 目录
- 加 `build/` 目录占位 + 注释
- **影响文件**: 1 个

#### P2-10 [SPEC-ADD] 新增 `testing-conventions.mdc`
- `core/patterns.yaml` 没测试模式,代码 0 个 `.test.ts` / `.spec.ts`
- 写一份"vitest + RTL, `*.test.ts(x)` 命名,放 `__tests__/` 同级"规约
- **影响文件**: 1 个

---

## 2. **不**采纳的修复项(规约视角)

| 报告原编号 | 理由 |
|---|---|
| 报告 #9 引入 `sql.js` | **风险收益不匹配**。当前 `electron-store` 已稳定支撑 UI 状态,引入 sql.js 是大规模重构,只在 `StatusBar` git status 缓存这一个用例上加 WASM 依赖,ROI 负。**改为 P2-6 在规约里把 `electron-store` 写明白**,等真有索引查询需求再升级。 |
| 报告 #11 删除重复 `.mdc` | `style-spec-entry.mdc` 明确写了 alwaysApply 入口,删除后入口断裂。**改为 P2-7 加 provenance 注释**,不破坏入口链。 |
| 报告 #13 (a) git init in project-handlers | **采纳,合并到 P0-3**。 |
| 报告 #13 (b) 修 `getGit` 死代码 | **采纳 = P2-1**。 |
| 报告 #13 (c) 删 `pnpm-workspace.yaml` | **采纳 = P2-2**。 |
| 报告 #13 (d) 加 eslint | **采纳 = P2-3**。 |
| 报告 #13 (e) 升级 Anthropic SDK | **采纳 = P2-8**。 |

---

## 3. 修复顺序与并行策略

**前置依赖(串行):**
1. **P0-1** AI 流式 — 独立,无依赖
2. **P0-2** `.galproj` 边界 — 独立,无依赖
3. **P0-3** Git 服务抽离 — 独立,无依赖
4. **P1-2** AST Visitor — 独立,无依赖
5. **P1-3** Export Composer — 独立,无依赖
6. **P1-5** AI 任务队列 — 依赖 P0-1(共用 `ai:stream` 通道)
7. **P1-1** 命名补齐 — 独立,无依赖
8. **P1-4** 渲染端 hook 补全 — 依赖 P0-1 + P1-5

**P2 全部独立,可最后批量做。**

---

## 4. 并行子智能体分批(4 个并发 worker)

| Worker | 任务 | 覆盖项 | 预估文件 |
|---|---|---|---|
| **A** | AI 流式 + 任务队列 | P0-1 + P1-4 + P1-5 | 5 个改 + 1 个建 |
| **B** | 核心哲学 — `.galproj` 边界 | P0-2 | 3-5 个改 |
| **C** | 核心哲学 — Git 服务化 + 命名补齐 | P0-3 + P1-1 | 2 个建 + 5-7 个改 |
| **D** | 模式 — Visitor + Export Composer | P1-2 + P1-3 | 6 个建 + 3 个改 |

**约束**:
- 每个 worker 独立 commit
- 不跨文件互相 import 新符号(避免编译冲突)— 共享符号(如 `useAiStream`)按命名规约放在 `lib/ipc/use-ai.ts`,worker A 负责,其他 worker 不动
- 完成后每个 worker 报告改动文件清单 + 是否需要 `pnpm typecheck` 二次跑
- 全部 P2 修复在 D 完成后由 1 个 worker 收尾(避免 4 个 worker 抢小文件)

---

## 5. 验收标准(完成定义)

- [ ] `pnpm typecheck` 通过
- [ ] `pnpm build` 成功
- [ ] `pnpm lint` 跑得起来(配置加好后)
- [ ] AI 面板流式逐 token 显示
- [ ] 创建项目 → `git log` 有 initial commit
- [ ] 保存脚本 → `git log` 多一条 commit
- [ ] `.galproj` JSON 不含 `scenes` 字段
- [ ] `src/main/git/git-service.ts` 存在
- [ ] `src/shared/dsl/visitor.ts` 存在,FlowView/PreviewCanvas 改用 `walkScript`
- [ ] `src/main/export/` 下 5 个 composer 文件齐备
- [ ] 新增的 3 份 `.mdc` 规则已落地
- [ ] `core/conventions.yaml` 的 `.galproj` 说明已加
