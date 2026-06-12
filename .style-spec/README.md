# AI Agent 须知

处理本项目前，请按以下顺序读取规则：

## 1. 必读：core/

生成任何代码前，必须先阅读：

- [core/naming.yaml](./core/naming.yaml) — 业务实体术语映射（Script → ScriptNode）
- [core/patterns.yaml](./core/patterns.yaml) — 通用代码模式（Parser-Composer Pipeline、AST Visitor）
- [core/conventions.yaml](./core/conventions.yaml) — 项目级技术约定（Electron 全栈、Git 即版本控制、仓库认证元信息）

## 2. 按需读取：domain/

根据任务涉及的功能域，按需读取对应子目录：

| 任务涉及 | 读取 |
|---------|------|
| 剧本编辑器 / 分支预览 | [domain/script-editor/naming.yaml](./domain/script-editor/naming.yaml) |
| 角色系统 / 立绘 | [domain/character/naming.yaml](./domain/character/naming.yaml) |
| 场景 / 背景 / BGM | [domain/scene/naming.yaml](./domain/scene/naming.yaml) |
| 语音 / TTS | [domain/voice/naming.yaml](./domain/voice/naming.yaml) |
| 导出功能 | [domain/export/naming.yaml](./domain/export/naming.yaml) |

## 3. 按需读取：layers/

根据任务涉及的技术层，按需读取：

| 任务涉及 | 读取 |
|---------|------|
| React 组件 / UI | [layers/renderer/conventions.yaml](./layers/renderer/conventions.yaml) |
| Electron 主进程 / IPC | [layers/main-process/conventions.yaml](./layers/main-process/conventions.yaml) |
| gal DSL 解析器 | [layers/dsl/conventions.yaml](./layers/dsl/conventions.yaml) |

## 4. 按需读取：languages/

| 任务涉及 | 读取 |
|---------|------|
| TypeScript 代码 | [languages/typescript/conventions.yaml](./languages/typescript/conventions.yaml) |
| JS（Lezer 插件等） | [languages/javascript/conventions.yaml](./languages/javascript/conventions.yaml) |

## 规则优先级

- `core/` 规则 > `layers/` 规则 > `languages/` 规则
- `domain/` 规则与 `core/` 规则互补，不冲突
- 如发现冲突，以 `core/` 为准

## 发现新模式时的操作

发现项目中反复出现的模式，请提案到 `.auto-update/pending-proposals/` 目录（后续创建），格式为 `{pattern-name}.yaml`，包含：

- `pattern_name`
- `description`
- `proposed_convention`
- `examples`

## 本项目的核心设计哲学

**文字游戏 = 语言意义选项的决策树**

- `.gal` 文件是 Canonical artifact（意义内核），所有导出从它派生
- 项目根目录即 Git 仓库根目录
- SQLite 仅存 UI 临时状态，不存决策树
- AI 是工作流的一等公民，嵌入剧本/立绘/语音/逻辑四个环节

