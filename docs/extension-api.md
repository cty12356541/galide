# Galide 扩展 API 设计规范（v0.7 战略冻结稿）

> 状态：**Design Frozen（仅设计，v0.7 不引入运行时加载器）**
> 上游依据：`.omo/plans/v07-debugger-dock-bench.md` Phase 4（T4-1）、`docs/agent-architecture.md`、`.style-spec/`
> 对标代码基线：`src/main/ai/agent/types.ts`、`src/main/ai/agent/tool-registry.ts`、`src/main/ai/agent/autonomy-gate.ts`、`src/main/ai/agent/create-default-registry.ts`

---

## 背景与定位

Galide 的核心架构把创作操作收敛在两条正交通道上：

1. **人类交互通道**：Renderer 经类型安全 IPC（`window.galide.*` + Zod Schema）读写项目根目录下的 `.gal` / `.galproj` / `project-brain.json` canonical 文件。
2. **Agent 工具通道**：Main 进程 `ReActExecutor` 经 `AutonomyGate` → `UserConfirm`（含 `overlayPreview` diff）→ `ToolRegistry` 执行结构化工具调用，并将 `ToolResult` 作为确定性 observation 回灌给模型。

本文档定义的**外部扩展 API（Extension API v1）仅面向第 2 条通道（Agent 工具注册表）**：允许社区与工作室在不分叉 Galide 源码的前提下，向 Agent 注入领域专用的剧本检查、术语规范化、资产校验或外部管线桥接工具，同时严守项目的安全边界、`.gal` canonical 语义与 UI 视觉一致性。

---

## 一、`tool-registry` 现役工具全量盘点

早期规划按模块估算约 15 个工具；历经 v0.5–v0.6 演进后，`createDefaultToolRegistry()`（`src/main/ai/agent/create-default-registry.ts`）实际已注册 **7 大模块、共 37 个内建工具**（`8 read` / `19 safeWrite` / `10 destructive`；其中 `35` 个运行于 `disk` 域，`2` 个运行于 `renderer` 域；全部 `19` 个 `safeWrite` 工具均开启 `previewable: true`）。

### 1.1 剧本工具集 `scriptTools`（17 个，`disk` 域）

| 工具名 | 子模块 | `risk` | `previewable` | 入参摘要 | 职责与副作用 |
|---|---|---|---|---|---|
| `list_scenes` | `script-read-tools` | `read` | 否 | `{ fileName? }` | 列出单文件或全项目 `.gal` 场景摘要（id / 来源文件 / 背景 / BGM） |
| `read_script` | `script-read-tools` | `read` | 否 | `{ fileName }` | 读取 `.gal` 源码文本（超 `8000` 字符截断） |
| `find_node` | `script-read-tools` | `read` | 否 | `{ fileName, id }` | 按 `id` 定位场景或标记节点所在行列 |
| `read_variables` | `script-read-tools` | `read` | 否 | `{ fileName }` | 扫描 `设:` 变量、门控选项 `[当:]` 与 `[若:]` 分支条件 |
| `create_script_file` | `script-read-tools` | `safeWrite` | 是 | `{ fileName }` | 创建空 `.gal` 文件（已存在则报 `DUPLICATE_FILE` 拒覆盖） |
| `create_scene` | `script-write-content-tools` | `safeWrite` | 是 | `{ fileName, sceneId, background?, bgm? }` | 在指定 `.gal` 末尾追加新场景（parse → mutate AST → serialize） |
| `add_dialogue` | `script-write-content-tools` | `safeWrite` | 是 | `{ fileName, sceneId, character, text }` | 向指定场景末尾追加角色对白 |
| `set_variable` | `script-write-content-tools` | `safeWrite` | 是 | `{ fileName, sceneId, name, op, value }` | 追加 `设:` 变量赋值/增减语句（含表达式语法校验） |
| `add_conditional_block` | `script-write-flow-tools` | `safeWrite` | 是 | `{ fileName, sceneId, condition, elifConditions?, ifDialogue?, elseDialogue? }` | 插入 `[若:]...[否则]...[若终]` 结构化条件块 |
| `add_gated_choice` | `script-write-flow-tools` | `safeWrite` | 是 | `{ fileName, sceneId, text, target, condition }` | 追加带 `[当: condition]` 门控的分支选项 |
| `add_choice` | `script-write-flow-tools` | `safeWrite` | 是 | `{ fileName, sceneId, text, target, condition? }` | 追加普通或可选门控选项 |
| `add_goto` | `script-write-flow-tools` | `safeWrite` | 是 | `{ fileName, sceneId, target }` | 追加无条件跳转 `[跳转:target]` |
| `add_marker` | `script-write-flow-tools` | `safeWrite` | 是 | `{ fileName, sceneId, id }` | 追加文件内唯一锚点 `=== id ===` |
| `update_dialogue` | `script-edit-tools` | `safeWrite` | 是 | `{ fileName, sceneId, index, character?, text }` | 按场景内对白序号（0 基）修订既有台词或说话人 |
| `update_scene_meta` | `script-edit-tools` | `safeWrite` | 是 | `{ fileName, sceneId, background?, bgm? }` | 更新或清空场景背景/BGM（禁止改 `sceneId` 防断链） |
| `delete_node` | `script-edit-tools` | `safeWrite` | 是 | `{ fileName, sceneId, index }` | 删除场景内第 `index` 个子节点 |
| `move_node` | `script-edit-tools` | `safeWrite` | 是 | `{ fileName, sceneId, from, to }` | 在场景内重排子节点顺序 |

### 1.2 项目清单工具集 `manifestTools`（4 个，`disk` 域）

| 工具名 | `risk` | `previewable` | 入参摘要 | 职责与副作用 |
|---|---|---|---|---|
| `list_characters` | `read` | 否 | `{}` | 列出 `.galproj` 所有角色卡及立绘数量 |
| `create_character` | `safeWrite` | 是 | `{ id, name, description, personality, sdPrompt? }` | 经 `patchGalproj` 新建唯一 `id` 角色卡 |
| `update_character` | `safeWrite` | 是 | `{ id, name?, description?, personality?, sdPrompt? }` | 修改角色卡属性（空串清空 `sdPrompt`） |
| `delete_character` | `safeWrite` | 是 | `{ id }` | 从 `.galproj` 移除角色卡（保留 `assets/` 物理图片） |

### 1.3 项目大脑工具集 `brainTools`（4 个，`disk` 域）

| 工具名 | `risk` | `previewable` | 入参摘要 | 职责与副作用 |
|---|---|---|---|---|
| `brain_read` | `read` | 否 | `{ kind? }` | 读取 `project-brain.json` 伏笔账本、角色关系、路线知识边界 |
| `brain_upsert_foreshadowing` | `safeWrite` | 是 | `{ id, description, status, plantedInSceneId?, ... }` | 登记/回收/放弃伏笔条目 |
| `brain_upsert_relationship` | `safeWrite` | 是 | `{ characterA, characterB, description, stages? }` | 无序角色对关系更新与历史阶段追加 |
| `brain_set_knowledge` | `safeWrite` | 是 | `{ condition, fact, known, id?, note? }` | 设置特定分支条件下的角色/读者已知事实边界 |

### 1.4 静态分析、命令投递、多模态与平台工具（12 个）

| 模块 | 工具名 | `domain` | `risk` | `previewable` | 职责与边界特征 |
|---|---|---|---|---|---|
| `analysisTools` | `analyze_reachability` | `disk` | `read` | 否 | 单文件或全项目合并 AST 的入口/不可达场景/悬空跳转分析 |
| `commandTools` | `navigate` | `renderer` | `read` | 否 | 投递 10 个纯视图 `CommandId`（切换面板/跳文件/开偏好） |
| `commandTools` | `dispatch_command` | `renderer` | `destructive` | 否 | 投递 4 个改状态 `CommandId`（`newScriptFile` / `closeProject` / `undo` / `redo`） |
| `multimodalTools` | `generate_background` | `disk` | `destructive` | 否 | 调生图后端写 `assets/backgrounds/<name>.png`（耗外部配额 + 二进制落盘） |
| `multimodalTools` | `generate_sprite` | `disk` | `destructive` | 否 | 调生图后端写 `assets/characters/` 并更新立绘元数据 |
| `multimodalTools` | `generate_voice` | `disk` | `destructive` | 否 | 调 TTS 写 `assets/voice/<lineId>.mp3` 与 `.voice.json` sidecar |
| `multimodalTools` | `generate_sprite_batch` | `disk` | `destructive` | 否 | 批量角色状态立绘生成 |
| `multimodalTools` | `generate_voice_batch` | `disk` | `destructive` | 否 | 批量台词语音合成 |
| `platformTools` | `export_project` | `disk` | `destructive` | 否 | Headless 运行多目标导出流水线（强制校验输出目录在 `projectPath` 内） |
| `platformTools` | `git_commit` | `disk` | `destructive` | 否 | Headless `git add` + `commit` |
| `platformTools` | `create_project` | `disk` | `destructive` | 否 | Headless 创建新项目并通过 `ctx.switchProject` 切换运行时上下文 |
| `platformTools` | `open_project` | `disk` | `destructive` | 否 | Headless 打开项目并通过 `ctx.switchProject` 同步 Renderer |

### 1.5 盘点结论对公开 API 的 4 条约束

1. **命名空间隔离必不可少**：内建工具使用无前缀 snake_case（如 `read_script`、`git_commit`）。公开扩展工具必须强制命名空间化为 `<vendor>_<pkg>__<tool>`（LLM 工具名合法字符集 `^[a-zA-Z0-9_-]{1,64}$`），严禁覆盖任何内建工具名。
2. **`ToolContext` 必须脱敏裁剪**：内建 `ToolContext` 暴露了 `switchProject`、`dispatch` 以及未设限路径的 `ToolFs`。公开 API 绝不能原样透出内部 `ToolContext`，而必须提供只局限于当前 `projectPath` 沙箱的 `ExtensionToolContext`。
3. **Overlay Diff 预览机制可直接复用**：`tool-registry.ts` 的 `overlayPreview` 通过替换 `ctx.fs` 在内存 Map 中重放 handler 生成 `{ before, after }`。只要扩展工具严格通过 `ctx.fs` 读写文本文件而不直接碰 `node:fs`，标记 `previewable: true` 即可零成本获得确认前 Diff 预览能力。
4. **结构化非抛错返回是循环稳定基石**：全部 37 个内建工具均把语法失败、索引越界、重复 ID 编码为 `{ ok: false, content, error: { code, message } }`，使 `ReActExecutor` 能自我纠错而非崩溃回滚。此契约必须冻结为扩展工具的硬性返回协议。

---

## 二、冻结的最小公开面（Minimal Frozen Public Surface `v1`）

公开类型包拟定为纯类型声明 `@galide/extension-api`（零运行时重依赖，消除宿主与扩展间 Zod 实例版本分裂问题，入参 Schema 采用标准 JSON Schema Draft 2020-12）。

### 2.1 扩展清单与生命周期入口

每个扩展目录根目录必须包含静态声明文件 `galide-extension.json`：

```json
{
  "apiVersion": "1.0",
  "id": "studio-sakura.glossary",
  "name": "Sakura 术语与文风审校工具集",
  "version": "0.1.0",
  "main": "./dist/index.mjs",
  "permissions": ["fs:read", "fs:write"]
}
```

入口模块仅暴露单一幂等注册函数 `activate`（与可选清理函数 `deactivate`）：

```ts
export type ExtensionPermission =
  | 'fs:read'       // 读取项目内非敏感文件（scripts/、project-brain.json、自定义数据文件）
  | 'fs:write'      // 通过沙箱 fs 写入项目内文本文件（受 AutonomyGate 管控）
  | 'dsl:ast'       // 使用宿主注入的纯函数 .gal parser / serializer

export interface ExtensionHostApi {
  readonly apiVersion: '1.0'
  registerTool<TArgs = Record<string, unknown>>(
    definition: ExtensionToolDefinition<TArgs>
  ): void
}

export interface GalideExtensionModule {
  activate(api: ExtensionHostApi): void | Promise<void>
  deactivate?(): void | Promise<void>
}
```

### 2.2 工具定义签名 `ExtensionToolDefinition`

```ts
export type ExtensionToolRisk = 'read' | 'safeWrite' | 'destructive'

export interface JsonSchemaObject {
  readonly type: 'object'
  readonly properties?: Readonly<Record<string, Record<string, unknown>>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
}

export interface ExtensionToolDefinition<TArgs = Record<string, unknown>> {
  /** 短工具名（不含前缀），匹配 /^[a-z][a-z0-9_]{1,39}$/；宿主注册时自动拼装为 ext_<vendor>_<pkg>__<name> */
  readonly name: string
  /** 面向 LLM 的功能与边界说明（建议 ≤ 200 字） */
  readonly description: string
  /** 风险分级，直接接入宿主 AutonomyGate */
  readonly risk: ExtensionToolRisk
  /** JSON Schema Draft 2020-12 入参契约；宿主在调用 handler 前执行严格校验 */
  readonly parameters: JsonSchemaObject
  /**
   * 仅对 risk='safeWrite' 有效：设为 true 时宿主在确认前以内存 overlay fs 预执行 handler，
   * 自动生成 before/after 文本 Diff 展示在 AgentConfirmDiff 面板中。
   */
  readonly previewable?: boolean
  /** 工具执行主体：严禁抛未捕获异常，业务失败须返回 ok: false */
  handler(args: TArgs, ctx: ExtensionToolContext): Promise<ExtensionToolResult>
}
```

### 2.3 受限上下文 `ExtensionToolContext`

```ts
/** 相对项目根目录的沙箱文件接口（拒绝绝对路径、拒绝 .. 穿越、拒绝符号链接逃逸） */
export interface ScopedProjectFs {
  readText(relPath: string): Promise<string>
  writeText(relPath: string, content: string): Promise<void>
  readDir(relPath: string): Promise<readonly string[]>
  exists(relPath: string): Promise<boolean>
}

/** 宿主注入的无副作用 .gal DSL 工具箱（保证与当前 IDE 内核 AST 100% 同构） */
export interface HostDslToolkit {
  parse(source: string):
    | { ok: true; value: unknown; warnings: readonly unknown[] }
    | { ok: false; error: readonly { line: number; column: number; message: string }[] }
  serialize(ast: unknown): string
}

export interface ExtensionToolContext {
  /** 当前取消信号（用户点击停止或单步超时触发） */
  readonly signal: AbortSignal
  /** 受权限声明裁剪的沙箱 FS（未声明 fs:write 时调用 writeText 直接返回 PERMISSION_DENIED） */
  readonly fs: ScopedProjectFs
  /** 零副作用 DSL 解析与序列化接口 */
  readonly dsl: HostDslToolkit
  /** 结构化诊断日志（写入扩展诊断通道，不污染 LLM observation） */
  readonly log: {
    info(message: string, meta?: Record<string, unknown>): void
    warn(message: string, meta?: Record<string, unknown>): void
    error(message: string, meta?: Record<string, unknown>): void
  }
}
```

### 2.4 权限分级与 `AutonomyGate` 交互矩阵

扩展工具复用 `src/main/ai/agent/autonomy-gate.ts` 的风险真值表，并叠加一层**外部扩展信任修正（External Trust Clamp）**：

| 工具 `risk` | `copilot` 模式 | `hybrid`（默认）模式 | `autonomous` 模式（已信任扩展） | `autonomous` 模式（首次/未信任扩展） |
|---|---|---|---|---|
| `read` | 自动放行（`allow`） | 自动放行（`allow`） | 自动放行（`allow`） | 自动放行（`allow`） |
| `safeWrite` | 暂停确认 + Diff（`confirm`） | 自动放行（`allow`） | 自动放行（`allow`） | 暂停确认 + Diff（`confirm`） |
| `destructive` | 暂停确认（`confirm`） | 暂停确认（`confirm`） | 自动放行（`allow`） | **强制暂停确认（`confirm`）** |

> 设计要点：即便用户把全局自主模式切到 `autonomous`，未经用户在项目级显式勾选“信任此扩展”的第三方扩展也**无法静默执行 `safeWrite` / `destructive` 操作**。

### 2.5 结构化结果与错误契约 `ExtensionToolResult`

```ts
export type StandardExtensionErrorCode =
  | 'SCHEMA_FAILED'         // 宿主入参 JSON Schema 校验未通过（handler 不执行）
  | 'PERMISSION_DENIED'     // 扩展未声明所需 permission 或触碰受保护路径
  | 'PATH_OUTSIDE_PROJECT'  // 路径越界或符号链接指向项目根外部
  | 'PARSE_FAILED'          // .gal 或 JSON 解析失败
  | 'NOT_FOUND'             // 目标文件/场景/条目不存在
  | 'CONFLICT'              // 唯一键冲突或前置状态不满足
  | 'TIMEOUT'               // 单次工具执行超时（默认 30_000ms）
  | 'CANCELLED'             // AbortSignal 已触发
  | 'TOOL_RUNTIME_ERROR'    // handler 抛出未捕获异常时由宿主兜底封装

export interface ExtensionToolResult {
  readonly ok: boolean
  /** 回灌给 LLM 的精炼文本 observation（宿主强制截断上限 8_000 字符） */
  readonly content: string
  /** 可选结构化载荷（仅供审计日志与测试断言，不直接拼接进 prompt） */
  readonly data?: unknown
  /** ok === false 时必填 */
  readonly error?: {
    readonly code: StandardExtensionErrorCode | `EXT_${Uppercase<string>}`
    readonly message: string
  }
}
```

---

## 三、安全模型与平台命令闸门

### 3.1 进程隔离与零 Node 原生逃逸

- **运行位置**：扩展代码**不在 Electron Main 主线程裸跑**，也不注入 Renderer；未来实现时统一托管于受限的 Electron `UtilityProcess`（或禁用 `workerData` 特权句柄的独立 `node:worker_threads` + 模块加载钩子），屏蔽 `electron`、`node:child_process`、`node:net`、`node:http` 与裸 `node:fs` 导入。
- **文件系统路径牢笼（Path Jail）**：
  1. `ScopedProjectFs` 只接受 POSIX 相对路径（如 `scripts/chapter1.gal`、`glossary.json`）。
  2. 宿主在执行真实 I/O 前计算 `resolved = path.resolve(projectPath, relPath)`，并对已存在父目录执行 `fs.realpath`，验证 `real.startsWith(realProjectPath + path.sep)`，彻底阻断 `../` 与软链接逃逸。
  3. **敏感路径黑名单**：硬性拒绝读写 `.git/**`、`.galide/keys*`、`.galide/extensions/**`（防止扩展自我篡改提权或窃取凭据、破坏 Git 对象库）。
  4. **写入广播联动**：当 `ScopedProjectFs.writeText` 修改了 `scripts/**/*.gal` 时，宿主自动复用 `createBroadcastingWriteFile` 广播 `script:changed`，保证卡片编辑器、CodeMirror 与大纲立即同步，无需扩展感知 IPC。

### 3.2 平台命令工具的宿主保留闸门（Host-Reserved Gate）

内建的 `platformTools`（`export_project`、`git_commit`、`create_project`、`open_project`）与 `commandTools`（`navigate`、`dispatch_command`）直接操控版本库提交、工作区项目切换及跨窗口命令总线，属于**宿主保留特权面（Host-Reserved Surface）**：

1. **禁止注册与劫持**：扩展注册表禁止注册任何与内建工具重名或以 `galide_` 开头的工具；禁止扩展直接调用 `ToolContext.switchProject` 或 `ToolContext.dispatch`。
2. **禁止隐式 Git / Shell 副作用**：扩展不得自行调用 `git`；所有写盘变更统一纳入宿主 `agent-loop` 任务前的 `GitSnapshot` 安全网——一旦任务中止或回滚，扩展通过 `ScopedProjectFs` 写入的变更与内建工具变更一并原子回退。
3. **未来外部子进程闸门（预留设计，默认关闭）**：若后续版本确需支持本地二进制工具桥接（例如外部音频响度归一化 `ffmpeg`），必须采用**静态白名单可执行文件声明 + 用户首次系统级弹窗授权 + 每次调用固定判定为 `risk: 'destructive'` + 无 shell 参数数组调用（`execFile`，禁用 `shell: true`）**四重闸门，绝不开放任意命令字符串执行。

### 3.3 资源配额与防御性护栏

- **单次超时**：默认 `30s`（超时后触发 `ctx.signal.abort()` 并向 Executor 返回 `{ ok: false, error: { code: 'TIMEOUT', ... } }`）。
- **单项目工具数上限**：单个扩展最多注册 `16` 个工具，单项目激活扩展工具总数上限 `32` 个，防止工具 Schema 膨胀挤占 Context Engine 的剧本上下文预算。
- **输出体积硬限**：`content` 超过 `8000` 字符时由宿主统一截断并附注 `\n…(扩展输出超长已截断)`，与 `script-tools-shared.ts` 的 `MAX_READ_CHARS` 对齐。

---

## 四、版本与兼容性策略

1. **双层版本号**：
   - `apiVersion`（扩展协议版本，形如 `'1.0'`）：遵循 `<major>.<minor>`。同主版本（`1.x`）保证向后兼容（仅做可选字段增量扩展，不删改既有 `ExtensionToolContext` / `ExtensionToolResult` 字段语义）。
   - 破坏性协议调整（如更改 `ScopedProjectFs` 签名或权限枚举）必须升级至 `2.0`。
2. **激活期硬协商（Fail-Fast Activation）**：
   - 宿主加载 `galide-extension.json` 时先用 Zod 校验清单结构与 `apiVersion`。
   - 若主版本不匹配（如宿主支持 `1.x`，扩展声明 `2.0`），宿主**整包拒绝加载该扩展**（绝不半注册部分工具），并向 `useErrorStore` 推送一条带扩展 ID 的可诊断告警。
3. **弃用窗口（Deprecation Policy）**：
   - 计划废弃的公开字段至少保留 **2 个 Galide 次版本**（例如 `v0.8` 标记 `@deprecated` 并在 `ctx.log.warn` 提示，最早 `v1.0` 移除），延续仓库内 `notifyProjectOpened → switchProject` 的平滑演进惯例。

---

## 五、端到端示例：社区工具 `studio-sakura.glossary`

下面完整演示一个社区扩展从**声明 → 注册 → 模型调用 → 确认前 Diff 预览 → 落盘返回**的全链路。该扩展读取项目根目录下的 `glossary.json`（术语正字表），自动将指定 `.gal` 剧本对白中的错别俗写替换为标准设定词。

### 5.1 扩展清单 `galide-extension.json`

```json
{
  "apiVersion": "1.0",
  "id": "studio-sakura.glossary",
  "name": "设定集术语正字工具",
  "version": "1.0.0",
  "main": "./index.mjs",
  "permissions": ["fs:read", "fs:write", "dsl:ast"]
}
```

### 5.2 扩展实现 `index.mjs`

```ts
import type {
  ExtensionHostApi,
  ExtensionToolContext,
  ExtensionToolResult
} from '@galide/extension-api'

interface NormalizeTermsArgs {
  fileName: string
  dryRun?: boolean
}

interface GlossaryFile {
  terms: Record<string, string> // { "错误写法": "标准设定词" }
}

export function activate(api: ExtensionHostApi): void {
  api.registerTool<NormalizeTermsArgs>({
    name: 'normalize_terms',
    description:
      '依据项目根目录 glossary.json 的术语表，将指定 scripts/*.gal 对白中的非标准写法统一替换为设定集正字。',
    risk: 'safeWrite',
    previewable: true,
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          pattern: '^(?!scripts/)(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\\.gal$',
          description: '相对于 scripts/ 的剧本文件名，如 chapter1.gal 或 act1/opening.gal'
        },
        dryRun: {
          type: 'boolean',
          description: '为 true 时仅统计命中次数而不写盘'
        }
      },
      required: ['fileName'],
      additionalProperties: false
    },
    async handler(
      args: NormalizeTermsArgs,
      ctx: ExtensionToolContext
    ): Promise<ExtensionToolResult> {
      if (ctx.signal.aborted) {
        return {
          ok: false,
          content: '术语正字已取消',
          error: { code: 'CANCELLED', message: 'aborted before execution' }
        }
      }

      if (!(await ctx.fs.exists('glossary.json'))) {
        return {
          ok: false,
          content: '项目根目录缺少 glossary.json，无法执行术语正字',
          error: { code: 'NOT_FOUND', message: 'glossary.json not found' }
        }
      }

      let glossary: GlossaryFile
      try {
        glossary = JSON.parse(await ctx.fs.readText('glossary.json')) as GlossaryFile
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return {
          ok: false,
          content: `glossary.json 解析失败: ${msg}`,
          error: { code: 'PARSE_FAILED', message: msg }
        }
      }

      const scriptRelPath = `scripts/${args.fileName}`
      if (!(await ctx.fs.exists(scriptRelPath))) {
        return {
          ok: false,
          content: `剧本文件不存在: ${scriptRelPath}`,
          error: { code: 'NOT_FOUND', message: `${scriptRelPath} not found` }
        }
      }

      const source = await ctx.fs.readText(scriptRelPath)
      const parsed = ctx.dsl.parse(source)
      if (!parsed.ok) {
        const detail = parsed.error.map((d) => `L${d.line}:${d.column} ${d.message}`).join('; ')
        return {
          ok: false,
          content: `${args.fileName} 存在语法错误，拒绝正字改写: ${detail}`,
          error: { code: 'PARSE_FAILED', message: detail }
        }
      }

      let updated = source
      let replacements = 0
      for (const [wrong, canonical] of Object.entries(glossary.terms ?? {})) {
        if (!wrong || wrong === canonical) continue
        const parts = updated.split(wrong)
        if (parts.length > 1) {
          replacements += parts.length - 1
          updated = parts.join(canonical)
        }
      }

      // 二次校验改写后仍是合法 .gal，守住 canonical 不变量
      const reparsed = ctx.dsl.parse(updated)
      if (!reparsed.ok) {
        return {
          ok: false,
          content: '术语替换后破坏了 .gal 语法结构，已中止写入',
          error: { code: 'EXT_REPARSE_INVALID', message: 'post-transform parse check failed' }
        }
      }

      if (!args.dryRun && replacements > 0) {
        await ctx.fs.writeText(scriptRelPath, updated)
      }

      return {
        ok: true,
        content:
          replacements === 0
            ? `${args.fileName} 未发现需替换的非标术语`
            : `${args.dryRun ? '[预览] ' : ''}已在 ${args.fileName} 完成 ${replacements} 处设定术语正字`,
        data: { fileName: args.fileName, replacements, dryRun: Boolean(args.dryRun) }
      }
    }
  })
}
```

### 5.3 运行时全链路时序（注册 → 调用 → 预览 → 结果）

1. **注册与工具名映射**：宿主读取 `galide-extension.json`，调用 `activate(api)`，将 `normalize_terms` 注册进 `ToolRegistry`，对外工具名映射为 `ext_studio_sakura_glossary__normalize_terms`。
2. **向 Provider 暴露 Schema**：`registry.toJsonSchemas()` 直接输出工具 `parameters` 与 `description`，OpenAI / Claude Adapter 零适配透传。
3. **LLM 发起调用**：`ReActExecutor` 收到 `ToolCall { id: "call_01", name: "ext_studio_sakura_glossary__normalize_terms", args: { fileName: "act1/opening.gal" } }`。
4. **门禁与 Overlay Diff 预览**：
   - 假设当前处于 `copilot` 模式（或该扩展尚未被标记为项目信任扩展），`AutonomyGate` 对 `risk: 'safeWrite'` 返回 `'confirm'`。
   - `agent-loop` 调用 `registry.preview(call, ctx)`：宿主构造内存 `overlayCtx`（拦截 `ctx.fs.writeText` 到暂存 Map），运行一次 `handler`，捕获 `scripts/act1/opening.gal` 的 `before` 与 `after` 文本并推送到 Renderer 的 `AgentConfirmDiff` 组件展示逐行差异。
5. **用户确认与落盘**：
   - 若用户点击「拒绝」，真实 `ScopedProjectFs` 从未被写入，Executor 收到拒绝 observation。
   - 若用户点击「允许」，`registry.execute(call, ctx)` 执行真实写入，宿主自动广播 `script:changed` 刷新编辑器，并将 `{ id: "call_01", ok: true, content: "已在 act1/opening.gal 完成 3 处设定术语正字" }` 回灌给 LLM 进入下一轮推理。

---

## 六、明确非目标（Explicit Non-Goals）

为防止架构发散与维护债失控，以下方向**明确排除在 Galide 扩展体系之外**：

1. **不开放 UI / React 视图扩展点**：不提供自定义侧栏 Tool Window、不开放自定义模态框/状态栏槽位、不允许扩展注入 CSS 或访问 Renderer DOM / Zustand Store。Galide 的工作区布局（`panelStates` 单一事实源）与 `.style-spec/` 视觉语言由核心团队封闭维护。
2. **不做在线扩展市场（No Marketplace）**：不建设中心化插件商店、账户发布流水线或远程代码动态拉取。后续若进入实现阶段，仅支持本地离线目录（如 `<project>/.galide/extensions/`）显式放置并通过 Git 随项目或团队仓库审阅管理。
3. **不允许扩展 `.gal` DSL 语法或修改运行时求值器**：扩展只能消费宿主提供的 `ctx.dsl.parse / serialize`，不得注册自定义行级语法、新表达式算子或自定义导出目标内部钩子，确保任何 `.gal` 文件在无扩展环境下依然可被标准预览 VM 及 Web / Ren'Py / Ink 导出器 100% 确定性编译。
4. **`v0.7` 不落地扩展运行时加载器**：本阶段仅冻结协议契约与安全边界；待真实外部创作团队出现至少 2 个无法由内建 37 工具覆盖的高频需求样本后，再立项实现 `UtilityProcess` 沙箱宿主。

---

## 七、自查评审记录（Self-Review Checklist）

- [x] **现役工具盘点完整性**：已核对 `src/main/ai/agent/create-default-registry.ts` 全量 7 个模块共 **37 个**内建工具，风险等级、`domain` 与 `previewable` 标记与源码逐一一致。
- [x] **最小公开面自洽性**：`ExtensionToolDefinition` 使用纯 JSON Schema 消除跨包 Zod 实例耦合；`ExtensionToolContext` 剥离了 `switchProject` / `dispatch` 内部特权句柄。
- [x] **安全闭环核验**：覆盖了路径穿越 + 符号链接 `realpath` 校验、`.git` / `.galide` 敏感目录黑名单、未信任扩展在 `autonomous` 模式下的 `confirm` 强制钳制，以及平台命令工具的宿主保留闸门。
- [x] **与既有架构兼容**：`previewable: true` 与 `tool-registry.ts` 的 `overlayPreview` 机制零改造啮合；`scripts/**/*.gal` 写入复用 `script:changed` 广播；子目录路径正则对齐 `v0.7` Phase 1 的 `GAL_FILE_NAME_RE`。
