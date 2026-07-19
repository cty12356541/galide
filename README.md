# Galide

AI-native galgame 制作 IDE。文字游戏 = 语言意义选项的决策树。

## 技术栈

- Electron + Node.js (全栈 TypeScript)
- React 19 + Vite + Tailwind CSS
- CodeMirror 6 剧本编辑器
- @xyflow/react 分支预览
- PixiJS v8 游戏运行时
- simple-git Git 集成
- 自研 `gal` DSL（Canonical 决策树格式）

## 核心设计哲学

- **`.gal` 文件是 Canonical artifact** —— 决策树本身,纯文本行级语义,Git-diff 友好
- **项目根目录即 Git 仓库根目录** —— 决策树原生支持版本控制
- **多技术栈导出** —— 同一份 .gal 导出为 Web/Ren'Py/Ink/JSON
- **AI 是工作流一等公民** —— 剧本/立绘/语音/逻辑深度嵌入

## 项目结构

```
galide/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── ipc/              # IPC handlers
│   │   ├── export/           # 多技术栈导出器
│   │   └── index.ts
│   ├── preload/              # contextBridge 桥接
│   ├── renderer/             # React 前端
│   │   └── src/
│   │       ├── app/          # IDE shell
│   │       ├── features/     # script-editor / flow-view / preview
│   │       └── lib/          # ipc / store
│   └── shared/               # 主-渲染端共享
│       └── dsl/              # gal DSL lexer/parser/types
├── .style-spec/              # 渐进式语义规约
├── .cursor/rules/            # Cursor 规则入口
├── electron.vite.config.ts
├── electron-builder.yml
└── package.json
```

## 风格规约

本项目使用 `.style-spec/` 渐进式语义规约系统。AI Agent 在处理代码前会自动读取。详见 [`.style-spec/README.md`](.style-spec/README.md)。

## 启动

### 仅启动(已装依赖后)

```bash
./scripts/start.sh
# 或 macOS 双击: scripts/start.command
# 等价: pnpm dev
```

启动 Vite dev server + Electron 窗口。Ctrl+C 退出。

### 一键构建+启动(首次或代码改了)

```bash
./scripts/dev.sh
# 或 macOS 双击: scripts/dev.command
```

依次跑:install → typecheck → lint → test → build → dev。
环境变量跳过:
- `SKIP_INSTALL=1` 跳过 pnpm install
- `SKIP_CHECKS=1` 跳过 typecheck/lint/test
- `SKIP_BUILD=1` 跳过 pnpm build
- `SKIP_DEV=1` 跳过 pnpm dev(只跑前置检查)

### 手动

```bash
pnpm install
pnpm dev
```

## 打包

```bash
pnpm build:mac    # macOS
pnpm build:win    # Windows
pnpm build:linux  # Linux
```

## 开发里程碑

- MVP v0.1 ✅ IDE 编辑体验(CodeMirror + React Flow + PixiJS 预览)
- MVP v0.2 ✅ AI 文案与逻辑(OpenAI / Claude / Ollama,流式输出)
- MVP v0.3 ✅ AI 视觉/听觉 — Edge TTS + 立绘 image-proxy;UI(VoicePanel/CharacterCard)已接通
- MVP v0.4 ✅ PyCharm 组件岛布局 + EditorCore 可调整分栏 + floating 窗口
- MVP v0.5 ✅ AI Agent 自动化平台 — tool-calling 循环 + 可切换自主/拓扑 + 全平台命令工具

## v0.5 状态(2026-06-21)

### AI Agent

- **main 中心执行** — agent 循环与工具在 main 进程,读写 `scripts/*.gal` + git;编排为 DAG(fan-in/fan-out),设计见 `docs/agent-architecture.md`
- **Tool Registry** — list_scenes / read_script / add_dialogue / export_project / git_commit / analyze_reachability 等
- **Agent 面板** — 步骤流(DAG stage 映射)、计划预览、destructive 确认、autonomy + topology 偏好

### 预览 (Preview Fidelity)

- **有序播放** — 共享 `playback-timeline` 按 AST 文档序推进 dialogue / choice / goto / marker
- **立绘层** — PixiJS 角色 sprite(left/center/right),VN 持久语义;资产经 `asset:resolve` IPC
- **BGM** — 场景 BGM 播放 + crossfade;预览 chrome 音量/静音(不含语音/TTS)
- **共享 VM** — `runtime-vm` 驱动编辑器预览与 Web 导出播放器;choice/goto 目标解析为场景或 marker
- **变量/条件** — `设: affinity = 10`、`[若: affinity >= 10]` 条件块、选项 `[当: expr]` 门控; 预览 VM + Web 导出共享求值
- **Ren'Py 导出** — `script.rpy` + `characters.rpy` + `images.rpy`;`show` 立绘 + 表达式/条件/菜单

### 多模态

- **语音** — Edge TTS(免费,默认) + ElevenLabs REST;VoicePanel 重新生成 + 偏好页试听
- **立绘** — image-proxy(SD/DALL-E/ComfyUI) + 角色卡「AI 补全」IPC;Agent `generate_sprite` 同步 `.galproj` spriteSet

### 功能改进 (2026-06-22)

- **Agent 路径** — 统一读写 `scripts/*.gal`(与编辑器 IPC 一致)
- **导出 fail-loud** — 任一剧本 parse 失败阻断导出并显示 file:line
- **预览 parity** — Preview/Flow/Outline 使用全项目 merged AST(与 Web 导出同源)
- **资产/Git** — 资产面板导入/删除;GitPanel Push/Pull

## v0.4 状态(2026-06-17)

### 新功能 (v0.4)

- **PyCharm 组件岛布局** — Menu Bar / Toolbar / Project Tabs / Left Tool Window /
  Center Split / Status Bar(6 区块)
- **EditorCore 中区** — 卡片/源码编辑 + SceneRail + FlowView + 可折叠 Preview
  (`react-resizable-panels` 分栏比例持久化)
- **浮出独立 BrowserWindow** — 任何 panel(script / flow / preview / left-tool / ai)
  都能浮出为独立 OS 窗口,主窗口对应槽位自动隐藏
  - 关闭浮出窗口自动恢复主窗口布局
  - 浮出窗口加"返回主窗口"按钮快速聚焦
  - 浮出上限 3 个,防误操作
- **布局持久化** — workspace preset + EditorCore 分栏经 localStorage 持久化

### 架构升级

> **注(2026-07-12):** UI 状态模型已迁移至「功能即岛 v3」:单一 `panelStates` map 作为 source of truth,
> `visiblePerSide` / `dockSide` / `activeSubIsland` 为派生字段,`floatingPanels` 保留数组形式。旧版 `dockSide` /
> `visiblePerSide` / `activeSubIsland` 仍可被持久化层读取并迁移,详见 `workspace-store.ts` / `use-workspace-persistence.ts`。

- 删 `workspaceLayout` 嵌套对象(治本,代码腐化主因)
- 简化 `useUiStore` 5 个标量字段:`workspacePreset` / `leftPanelOpen` /
  `leftPanel` / `aiPanelOpen` / `aiDockedLocation`
- IPC 边界全部走 zod schema 校验(`IpcSchemaError` 透传 `SCHEMA_FAILED` code)
- main 端 handler 入口 `tryRegister` 隔离,任一失败不阻断 `createWindow`
- 共享 hook `usePanelFloat` / `useWorkspacePersistence` 统一行为

### 已知限制

- 导出目标:Web ✅ / JSON ✅ / Ren'Py ✅ / Ink ✅ / Electron-desktop ✅(壳工程 MVP,可运行;打包分发/签名/安装器待后续)
- 多窗口 IPC sync:export progress 按发送者路由,其他 IPC 暂用 default focused window
- e2e 测试需本地有 GUI 环境跑

## 测试与质量

[![CI](https://github.com/cty12356541/galide/actions/workflows/ci.yml/badge.svg)](https://github.com/cty12356541/galide/actions/workflows/ci.yml)

完整门禁由 CI 与 pre-commit 强制(0 error 为通过条件,非手动声明):

```bash
pnpm typecheck    # tsc,CI 强制 0 error
pnpm lint         # eslint,CI 强制 0 error
pnpm test         # vitest,CI 强制全绿
pnpm build        # electron-vite build + 字体体积预算检查
```
