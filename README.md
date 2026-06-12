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
- MVP v0.2 AI 文案与逻辑
- MVP v0.3 AI 视觉/听觉
- MVP v0.4 多技术栈导出 (Web ✅, Ren'Py / Ink / Electron-desktop 后续)
