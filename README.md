# Galide

AI-native galgame 制作 IDE。文字游戏 = 语言意义选项的决策树。

## 技术栈

- Electron + Node.js (全栈 TypeScript)
- React 18 + Vite + Tailwind CSS
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
- MVP v0.3 ⏳ AI 视觉/听觉 — Edge TTS 已实现;立绘生成经 image-proxy(SD/DALL-E),需本地 SD 或 API Key
- MVP v0.4 ✅ PyCharm 组件岛布局 + mosaic + floating 窗口
- MVP v0.5 ✅ AI Agent 自动化平台 — tool-calling 循环 + 可切换自主/拓扑 + 全平台命令工具

## v0.5 状态(2026-06-21)

### AI Agent

- **main 中心执行** — agent 循环与工具在 main 进程,直接操作磁盘 `.gal` + git;写盘后 `script:changed` 广播
- **Tool Registry** — list_scenes / read_script / add_dialogue / analyze_reachability / generate_sprite / dispatch_command 等
- **Agent 面板** — 步骤流、计划预览、destructive 确认、autonomy + topology 偏好

### 多模态

- **语音** — Edge TTS(免费,默认) + ElevenLabs REST(VoicePreferences / voiceConfig.voiceId;Key 走 key-store)
- **立绘** — image-proxy 支持 SD WebUI / DALL-E / ComfyUI(完整 workflow 提交+轮询);角色 sdPrompt 与 sprite 路径分离

## v0.4 状态(2026-06-17)

## v0.4 状态(2026-06-17)

### 新功能

- **PyCharm 组件岛布局** — Menu Bar / Toolbar / Project Tabs / Left Tool Window /
  Center Split / Status Bar(6 区块)
- **Mosaic 中区可拆** — ScriptEditor / FlowView / PreviewCanvas 三个 panel 拖拽组合,
  布局通过 electron-store 持久化(独立 `galide-mosaic` namespace,800ms debounce)
- **浮出独立 BrowserWindow** — 任何 panel(script / flow / preview / left-tool / ai)
  都能浮出为独立 OS 窗口,主窗口对应槽位自动隐藏
  - 关闭浮出窗口自动恢复主窗口布局
  - 浮出窗口加"返回主窗口"按钮快速聚焦
  - 浮出上限 3 个,防误操作
- **脏数据 UI 警告** — mosaic 持久化文件被破坏时,sanitize 检测并 toast 提示

### 架构升级

- 删 `workspaceLayout` 嵌套对象(治本,代码腐化主因)
- 简化 `useUiStore` 5 个标量字段:`workspacePreset` / `leftPanelOpen` /
  `leftPanel` / `aiPanelOpen` / `aiDockedLocation`
- IPC 边界全部走 zod schema 校验(`IpcSchemaError` 透传 `SCHEMA_FAILED` code)
- main 端 handler 入口 `tryRegister` 隔离,任一失败不阻断 `createWindow`
- 共享 hook `usePanelFloat` / `useMosaicPersistence` 统一行为

### 已知限制

- 导出目标:Web ✅ / JSON ✅ / Ren'Py / Ink / Electron-desktop ⏳(stub,UI 标注"即将支持")
- 多窗口 IPC sync:export progress 按发送者路由,其他 IPC 暂用 default focused window
- e2e 测试需本地有 GUI 环境跑

## 测试与质量

```bash
pnpm typecheck    # 0 error
pnpm lint         # 0 error
pnpm test         # 45 文件 / 368 测试
pnpm build        # 成功
```
