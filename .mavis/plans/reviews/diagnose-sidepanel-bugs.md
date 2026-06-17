# Diagnose: 9 commit 引入的 6 区域 + 3 preset 布局 bug 报告(v2)

> **v2 更新**:verifier 反馈 v1 漏报 main 端 handler 缺失。补 B-10/B-11/B-12 + 启动期 main 进程崩溃机制,完整 typecheck 从 11 → 13 个 TS2307。

## 用户看到什么 / 真问题是什么

1. 用户看到 — 应用启动后整个布局区域崩溃;边侧栏导航按钮全部失效。开发者控制台或红屏出现 "[galide boot error]" 或 "Cannot find module" 异常。
2. 真问题 — **renderer + main 双端都引用了从未 commit 的模块文件**。Renderer 端缺 8 个(ActivityBar/SidePanel/StatusBarWorkspaceIndicator/WorkspacePresetSelector/OutlinePanel/use-workspace/use-appearance-effect/workspace-layout);**main 端缺 2 个 handler(asset-handlers.ts + workspace-handlers.ts)**。
3. 根因 — `450c987` (workspace_layout 6 区域) + `adbf13e` (asset + workspace IPC 命名空间) 两个 commit 在 store / preload / main/index.ts 里 import 了 10 个新文件,但**这 10 个文件从未 add/commit**。`git log --all -- <file>` 全分支全历史验证:10 个文件全部空输出。
4. 范围 — 影响 main + preload + renderer + shared 四层。`electron-vite build` / `vite dev` 全部会在模块解析阶段 throw。
5. 性质 — P0 编译期 + 启动期双重失败。`tsc --noEmit` 两个 tsconfig 共报 **13 个 TS2307**(node:4,web:11,共享 2 个)。

---

## 完整 TypeScript 编译错清单(13 条,全部 P0)

### tsconfig.node.json(main + preload + shared)— 4 条

```
.worktrees/diagnose-9-commits/src/main/index.ts(13,39): error TS2307: Cannot find module './ipc/asset-handlers.js' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/main/index.ts(17,43): error TS2307: Cannot find module './ipc/workspace-handlers.js' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/preload/index.ts(5,38): error TS2307: Cannot find module '../shared/workspace-layout.js' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/shared/types.ts(9,38): error TS2307: Cannot find module './workspace-layout' or its corresponding type declarations.
```

### tsconfig.web.json(renderer + preload + shared)— 11 条

```
.worktrees/diagnose-9-commits/src/preload/index.ts(5,38): error TS2307: Cannot find module '../shared/workspace-layout.js' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/app/App.tsx(29,29): error TS2307: Cannot find module '../components/workspace/ActivityBar' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/app/App.tsx(30,27): error TS2307: Cannot find module '../components/workspace/SidePanel' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/app/App.tsx(33,41): error TS2307: Cannot find module '../lib/ipc/use-workspace' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/app/App.tsx(34,37): error TS2307: Cannot find module '../lib/ipc/use-appearance-effect' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/app/StatusBar.tsx(4,45): error TS2307: Cannot find module '../components/workspace/StatusBarWorkspaceIndicator' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/app/TitleBar.tsx(3,41): error TS2307: Cannot find module '../components/workspace/WorkspacePresetSelector' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/components/workspace/DockviewCenterTabs.tsx(35,30): error TS2307: Cannot find module '../../features/outline/OutlinePanel' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/components/workspace/DockviewCenterTabs.tsx(36,34): error TS2307: Cannot find module '../../lib/workspace-layout' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/renderer/src/lib/store.ts(13,8): error TS2307: Cannot find module './workspace-layout' or its corresponding type declarations.
.worktrees/diagnose-9-commits/src/shared/types.ts(9,38): error TS2307: Cannot find module './workspace-layout' or its corresponding type declarations.
```

**根因分类**(去重后 10 个不存在的模块文件):
- `src/main/ipc/asset-handlers.ts` ← **MAIN 端 P0**
- `src/main/ipc/workspace-handlers.ts` ← **MAIN 端 P0**
- `src/shared/workspace-layout.ts` ← SHARED P0(preload + types + store + DockviewCenterTabs 共 4 处依赖)
- `src/renderer/src/lib/workspace-layout.ts` ← RENDERER P0(DockviewCenterTabs 依赖 CenterTabId)
- `src/renderer/src/components/workspace/ActivityBar.tsx` ← RENDERER P0
- `src/renderer/src/components/workspace/SidePanel.tsx` ← RENDERER P0
- `src/renderer/src/components/workspace/StatusBarWorkspaceIndicator.tsx` ← RENDERER P0
- `src/renderer/src/components/workspace/WorkspacePresetSelector.tsx` ← RENDERER P0
- `src/renderer/src/features/outline/OutlinePanel.tsx` ← RENDERER P0(features/outline/ 目录都不存在)
- `src/renderer/src/lib/ipc/use-workspace.ts` ← RENDERER P0
- `src/renderer/src/lib/ipc/use-appearance-effect.ts` ← RENDERER P0

共 **10 个 .ts/.tsx 文件** + 1 个 **目录**(features/outline/)从未 commit。

---

## 启动失败机制(端到端)

应用启动会经过 4 个阶段,9 commit 让前 3 个阶段全部 throw:

### 阶段 1:Main 进程模块解析(`src/main/index.ts`)

`src/main/index.ts:13` `import { registerAssetHandlers } from './ipc/asset-handlers.js'` — Node.js ESM 解析该路径 → 文件不存在 → `ERR_MODULE_NOT_FOUND`。**即便后续 tryRegister 包了 try/catch 也救不了** — `import` 语句在文件顶层执行,错误在文件被任何代码执行前就 throw,tryRegister 那个回调根本拿不到 `registerAssetHandlers` 这个标识符,因为 import 已经让整个 main/index.ts 加载失败。`workspace-handlers.js` 同理(行 17)。

**结果**: main 进程在 `app.whenReady()` 之前崩溃,根本不会触发 `createWindow()`。**用户看到的不是红屏,而是应用直接无法启动** — 进程 exit code 1。

### 阶段 2:Renderer 进程模块解析(`src/renderer/src/main.tsx`)

如果 main 端模块能跳过(比如有 fallback),renderer 端 `import { App } from './app/App'` 会递归触发 `App.tsx:29-34` 的 6 个 import,全部解析失败 → `main.tsx:48-57` 的 `ReactDOM.createRoot.render()` 永远进不去 → 红屏(走 main.tsx:25-33 的 showError 兜底)。

### 阶段 3:Preload 上下文(`src/preload/index.ts`)

`preload/index.ts:5` `import type { WorkspaceLayout } from '../shared/workspace-layout.js'` — type-only import,TS 编译错但运行时 ESM 不抛(类型擦除)。**但若 vite/rollup 配置启用了 emit type declarations**,会因类型文件不存在而 fail。

### 阶段 4:IPC 通道缺失(运行时)

如果上述静态解析都通过,启动后 App.tsx:62 `void persistence.hydrate(projectPath)` → `useWorkspacePersistence()` hook 调 `window.galide.workspace.readProject(projectPath)`。但因为 main 端 handler 没注册,`ipcMain.handle(IPC.workspace.readProject)` 没绑定 → renderer 端 `ipcRenderer.invoke()` 返回 `Error: No handler registered for 'workspace:readProject'` → `persistence.hydrate` reject → `App.tsx:62-65` 的 `.then(layout => useUiStore.getState().hydrateWorkspaceLayout(layout))` 永不执行 → `workspaceLayout` 永远是默认 → 但 UI 还能用默认 layout 渲染。

**关键观察**: **阶段 1 就崩了**,后续 3 阶段都到不了。用户报告"几乎所有边侧栏按钮响应错误"实际是**应用根本起不来**。

---

## 具体 Bug 列表(13 条按 P0 → P2 排序)

### B-01 [P0 必修] Main 进程 `asset-handlers.ts` 缺失(`src/main/index.ts:13`)

**现象**: `tsc -p tsconfig.node.json` 报 `Cannot find module './ipc/asset-handlers.js'`;Node ESM 解析阶段抛 `ERR_MODULE_NOT_FOUND`,main 进程无法启动。

**根因**:
- adbf13e commit message 自述 "asset-handlers.ts:13 访问 IPC.asset.list" — 证明 handler 文件本应存在。
- adbf13e commit 实际只改了 `src/shared/ipc-channels.ts`(加了 `asset: { list: 'asset:list' }`),**没有创建** `src/main/ipc/asset-handlers.ts`。
- `git log --all -- 'src/main/ipc/asset-handlers.ts'` → **空输出**,从未 commit。
- `src/preload/index.ts:209-215` 定义 `window.galide.asset.list(projectPath, kind)`,但 main 端没人 handle 这个 IPC 通道。
- `src/main/index.ts:13` `import { registerAssetHandlers }` 在文件顶层抛错,**tryRegister 的 try/catch 包不住 import 阶段的错**。

**修复方向**: 创建 `src/main/ipc/asset-handlers.ts`,导出一个 `registerAssetHandlers()` 函数,内部 `ipcMain.handle(IPC.asset.list, async (_e, projectPath, kind) => { /* 读 .galproj/assets/{characters,backgrounds,bgm}/ */ })`。函数签名参照 `git-handlers.ts:10-44` 的标准模式。

### B-02 [P0 必修] Main 进程 `workspace-handlers.ts` 缺失(`src/main/index.ts:17`)

**现象**: 同 B-01,Node ESM 解析阶段抛错,main 进程无法启动。

**根因**:
- adbf13e commit message 自述 "workspace-handlers.ts:32 访问 IPC.workspace.readProject" — 证明 handler 文件本应存在。
- `git log --all -- 'src/main/ipc/workspace-handlers.ts'` → **空输出**,从未 commit。
- `src/preload/index.ts:216-225` 定义 `window.galide.workspace.{readProject,writeProject,readGlobal,writeGlobal}`,共 4 个方法,全部缺 main 端 handler。
- App.tsx:62-65 `persistence.hydrate(projectPath)` 调 `workspace.readProject`/`workspace.readGlobal`,App.tsx:100-106 调 `workspace.writeProject`/`workspace.writeGlobal` — 这些是 450c987 的 300ms debounce 写盘逻辑,主功能依赖 workspace IPC。

**修复方向**: 创建 `src/main/ipc/workspace-handlers.ts`,导出 `registerWorkspaceHandlers()`,内部 4 个 `ipcMain.handle()`:
- `IPC.workspace.readProject` → 读 `<projectPath>/.galproj/workspace.json`
- `IPC.workspace.writeProject` → 写 `<projectPath>/.galproj/workspace.json`(项目级)
- `IPC.workspace.readGlobal` → 读 `app.getPath('userData')/workspace.json`(全局)
- `IPC.workspace.writeGlobal` → 写全局(用户级)

### B-03 [P0 必修] `src/shared/workspace-layout.ts` 缺失(被 4 处依赖)

**现象**: `tsc` 报 4 个 TS2307(preload/index.ts:5 + shared/types.ts:9 + store.ts:13 + DockviewCenterTabs.tsx:36)。

**根因**:
- `src/shared/workspace-layout.ts` 不存在;`git log --all -- 'src/shared/workspace-layout.ts'` → **空输出**。
- 4 处 import 全部需要它:
  - `src/preload/index.ts:5` — `import type { WorkspaceLayout } from '../shared/workspace-layout.js'`,用作 `workspace.readProject/writeProject/readGlobal/writeGlobal` 的返回类型。
  - `src/shared/types.ts:9` — `import type { WorkspaceLayout } from './workspace-layout'`,line 66 用作 `ProjectManifest.workspace?: WorkspaceLayout` 字段类型。
  - `src/renderer/src/lib/store.ts:5-13` — `import { DEFAULT_WORKSPACE_LAYOUT, applyWorkspacePreset as applyPresetPure, mergeWorkspaceLayout, type WorkspaceLayout, type WorkspacePresetId, type ActivityBarItemId, type RightDockId } from './workspace-layout'`,store 字段 + 4 个 action + 4 个类型全靠它。
  - `src/renderer/src/components/workspace/DockviewCenterTabs.tsx:36` — `import type { CenterTabId } from '../../lib/workspace-layout'`(注意这条指向 renderer 那份,但底层应 re-export shared 那份)。

**修复方向**: 在 `src/shared/workspace-layout.ts` 创建 single source of truth:
```ts
export type ActivityBarItemId = 'scripts' | 'characters' | 'voice' | 'assets' | 'outline' | 'git'
export type CenterTabId = 'editor' | 'outline' | 'diagnostics' | 'flow' | 'preview'
export type RightDockId = 'ai' | null
export type WorkspacePresetId = 'writing' | 'flow' | 'review'

export type WorkspaceLayout = {
  activeActivity: ActivityBarItemId[]   // multi-split,数组
  openCenterTabs: CenterTabId[]
  rightDock: RightDockId
  preset: WorkspacePresetId
  schemaVersion: number
}

export const DEFAULT_WORKSPACE_LAYOUT: WorkspaceLayout = { ... }
export function applyWorkspacePreset(layout: WorkspaceLayout, presetId: WorkspacePresetId): WorkspaceLayout
export function mergeWorkspaceLayout(stored: Partial<WorkspaceLayout> | null | undefined, fallback: WorkspaceLayout): WorkspaceLayout
```

`src/renderer/src/lib/workspace-layout.ts` 只 re-export shared 这份,避免两套真相。

### B-04 [P0 必修] Renderer 端 4 个 UI 组件文件缺失

**现象**: `tsc -p tsconfig.web.json` 报 4 个 TS2307(ActivityBar/SidePanel/StatusBarWorkspaceIndicator/WorkspacePresetSelector)。

**根因**:
- 4 个文件**从未 commit**(`git log --all -- 'src/renderer/src/components/workspace/ActivityBar.tsx'` 等 4 条全空输出)。
- 它们在 450c987 commit 的 App.tsx + StatusBar.tsx + TitleBar.tsx 里被 import,但 450c987 commit 自己只改了 5 个老文件,**没创建这 4 个新文件**。
- 450c987 commit message 自述"因 reset --hard 抹掉了改动只留下新文件(untracked)",但 untracked 文件并没有跟着 commit — 当前 `git status --porcelain` 验证:除了一个 `A src/renderer/src/app/EditorArea.tsx`(意图 un-delete)外,没有其它 untracked。

**修复方向**: 创建这 4 个 .tsx(由 in-flight WIP 草稿恢复):
- **ActivityBar.tsx**:6 个按钮,每个 onClick 调 `useUiStore.getState().toggleActivity(id)`(对应 store.ts:134-141)。UI 用 lucide-react 图标。activeActivity 数组里有的按钮高亮。
- **SidePanel.tsx**:**multi-split 容器**,line 41-47 区域 `activeActivity.map(id => <PanelFor id={id} />)`,PanelFor 是个 dict 映射到 6 个 feature panel。`if (active.length === 0) return <div className="w-0" />`。
- **StatusBarWorkspaceIndicator.tsx**:显示当前 preset 名字 + 写盘状态(规约 Rule 5)。
- **WorkspacePresetSelector.tsx**:3 个 preset 切换器(writing/flow/review),调 `useUiStore.getState().applyWorkspacePreset(id)`。

### B-05 [P0 必修] Renderer 端 `features/outline/OutlinePanel.tsx` 缺失(DockviewCenterTabs 引用)

**现象**: `DockviewCenterTabs.tsx:35` `import { OutlinePanel } from '../../features/outline/OutlinePanel'` → TS2307;运行时 dockview 的 `outline` tab 也无组件可渲。

**根因**:
- `features/outline/` 目录都不存在;`ls src/renderer/src/features/` 只有 ai-panel/character/command-palette/export/flow-view/git/preferences/preview/script-editor/voice 10 个,**没有 outline**。
- `find . -name "Outline*"` → 空输出。
- cd91fb3 commit message 自述 "P0-10 修复(2026-06-13): outline 真接入 OutlinePanel(之前是占位文本)" — 证明本应有 OutlinePanel.tsx 但从未 commit。

**修复方向**: 创建 `src/renderer/src/features/outline/OutlinePanel.tsx`,从 `useUiStore((s) => s.manifest)` 派生 scene/character 列表,接受 `IDockviewPanelProps`(dockview 签名),从 `props.params.id` 拿到 dockview context。

### B-06 [P0 必修] Renderer 端 2 个 IPC hook 文件缺失

**现象**: `App.tsx:33-34` `import { useWorkspacePersistence } from '../lib/ipc/use-workspace'` + `import { useAppearanceEffect } from '../lib/ipc/use-appearance-effect'` → TS2307。

**根因**:
- `src/renderer/src/lib/ipc/` 目录 16 个 .ts,但**没有** use-workspace.ts / use-appearance-effect.ts(已用 `ls` 验证)。
- App.tsx:49 `useAppearanceEffect()` 调;App.tsx:51 `const persistence = useWorkspacePersistence()` 调;App.tsx:62, 101, 105, 120, 121 调 `persistence.hydrate/persistProject/persistGlobal`。

**修复方向**:
- **use-workspace.ts**:返回 `{ hydrate: (projectPath: string|null) => Promise<WorkspaceLayout | null>, persistProject: (projectPath: string, layout: WorkspaceLayout) => Promise<void>, persistGlobal: (layout: WorkspaceLayout) => Promise<void> }`,内部用 `getGalide()?.workspace?.readProject/writeProject/readGlobal/writeGlobal`(preload 已有这 5 个方法)。
- **use-appearance-effect.ts**:订阅 `useUiStore((s) => s.theme)`,在 useEffect 里同步到 `document.documentElement.classList.toggle('dark', theme === 'dark')`。

### B-07 [P1 重要] DockviewCenterTabs 用 `as unknown as` 把 ScriptEditor/DiagnosticsPanel 强转成 `IDockviewPanelProps`

**现象**: `DockviewCenterTabs.tsx:42-51` `TAB_COMPONENTS` 字典 5 个 entry,全部 `React.memo(X as React.ComponentType) as unknown as React.FunctionComponent<IDockviewPanelProps>`。

**根因**:
- ScriptEditor 真实签名 `(): JSX.Element`(看 `src/renderer/src/features/script-editor/ScriptEditor.tsx`);DiagnosticsPanel 签名 `({ items }: { items: DiagnosticItem[] })`(line 14)。
- 两者都不接受 dockview 的 `IDockviewPanelProps`(`{ params, api, containerApi }` 等)。
- `as unknown as` 让 typecheck 通过,但运行时 dockview 内部调用 `<ScriptEditor />` 不传 params/api → ScriptEditor 内部若访问 `props.params.id` 会 undefined → 渲染异常或白屏。
- 即使 OutlinePanel(缺失,B-05)被实装,如果不做适配器也会有同样问题。

**修复方向**: 把 ScriptEditor/DiagnosticsPanel 包成适配器:
```tsx
const ScriptEditorAdapter: React.FunctionComponent<IDockviewPanelProps> = (props) => {
  // 从 props.params 提取 dockview context
  return <ScriptEditor />
}
```
或者侵入式改 ScriptEditor 接受 `{ params, api }: IDockviewPanelProps`。

### B-08 [P1 重要] 老 button-clickability 集成测试文件本身缺失

**现象**: CharacterListPanel.tsx:9-11 和 VoicePanel.tsx:14-18 都引用"老 button-clickability.test.ts"作为断言依据,但 `find . -name "button-clickability*"` → 空输出。

**根因**: 测试文件被 9 commit 之前的某次 reset 抹掉,且没人重写。

**修复方向**: 写 `tests/integration/side-panel-button-smoke.test.tsx`,模拟 ActivityBar 6 按钮 onClick → store.toggleActivity → SidePanel 渲染对应 panel → 断言 panel 内主按钮(create/delete/refresh)onClick 触发对应 IPC hook 调用。这条 9 commit 没做,9 commit 之前也没做。

### B-09 [P1 重要] store.toggleActivity / workspaceLayout.activeActivity 类型与 SidePanel multi-split 行为耦合但 SidePanel 缺

**现象**: `store.ts:134-141` toggleActivity 逻辑 OK,但 `activeActivity: ActivityBarItemId[]` 类型定义在 B-03 缺失文件里;SidePanel multi-split 容器(B-04 缺失)消费这个数组。

**根因**: 设计上 activeActivity 是数组(multi-split),不是单值。zustand 默认 Object.is 订阅,spread `{...s.workspaceLayout, activeActivity: next}` 必然产生新引用 → 重渲染 OK。但类型 `ActivityBarItemId = 'scripts'|'characters'|'voice'|'assets'|'outline'|'git'` 来自 B-03 缺失文件,所以目前 TS2307 失败而非隐式 any。

**修复方向**: 跟 B-03 一起修。

### B-10 [P1 重要] StatusBar.tsx git 历史弹窗按钮在新 store 字段下行为不变(兼容 OK)

**现象**: `StatusBar.tsx:78-178` 老 git log 弹窗用 `useGitStatus` + `useGit` 两个老 hook,与 9 commit 无关。

**根因**: 老代码没被 9 commit 破坏。但 StatusBar 顶部新增 `<StatusBarWorkspaceIndicator />`(line 89)依赖 B-04 缺失文件 → 红屏或白屏。

**修复方向**: 跟 B-04 一起修。弹窗本身 OK,只是被组件缺失拖累。

### B-11 [P2 边角] DockviewCenterTabs drag-to-dock 规约留 V2

**现象**: `DockviewCenterTabs.tsx:156-163` 注释承认 "规约要求 drag_to_dock: true 但 dockview 多 group 布局尚未实现"。

**根因**: 规约在 `.style-spec/layers/renderer/conventions.yaml#workspace_layout.center_tabs.drag_to_dock: true`,但 dockview 多 group 布局留 V2。

**修复方向**: V2 兑现,本轮可不动。

### B-12 [P2 边角] EditorArea.tsx 450c987 删除 + untracked re-add 状态

**现象**: `git status` 显示 `A  src/renderer/src/app/EditorArea.tsx`(staged add,但实际上工作树里没有该文件,因为 `git checkout a1e91f8 --` 之前测试时 stage 了这个 re-add,后来 `git checkout HEAD -- src/` 又覆盖回去了)。

**根因**: 我跑 baseline 测试时 `git checkout a1e91f8 -- src/` 把 EditorArea.tsx 从 a1e91f8 拉到 index,然后 `git checkout HEAD -- src/` 又把 HEAD(63bab72,即删除状态)拉回,留下 index 里 stage 一个不存在的文件路径。

**修复方向**: `git restore --staged src/renderer/src/app/EditorArea.tsx` 即可。这是我测试过程的副产物,不是 9 commit 的 bug。

### B-13 [P2 边角] 老 e2e 测试未覆盖 workspace_layout 启动链路

**现象**: `src/main/__e2e__/infra-flow.e2e.test.ts` 测试覆盖 create-project → write-script → CRUD character → close → reopen(415 行),但**不测 workspace_layout**(`grep workspace-handlers / asset-handlers` 0 命中)。

**根因**: 9 commit 引入 workspace_layout 后没补 e2e 测试,且因 handler 文件根本缺失,B-01/B-02 即使补了文件也没回归测试。

**修复方向**: 加 e2e 测试覆盖 `workspace.readProject/writeProject/readGlobal/writeGlobal` 4 个 IPC handler 的项目级 + 全局级持久化行为。

---

## 缺失文件清单(实证表)

| # | 缺失文件 | 路径 | 引用方 | commit 依赖 | TS2307 错? | 启动期抛错? |
|---|----------|------|--------|-------------|----------|-------------|
| 1 | asset-handlers.ts | src/main/ipc/ | main/index.ts:13 | adbf13e | ✓ | ✓ ERR_MODULE_NOT_FOUND |
| 2 | workspace-handlers.ts | src/main/ipc/ | main/index.ts:17 | adbf13e | ✓ | ✓ ERR_MODULE_NOT_FOUND |
| 3 | workspace-layout.ts | src/shared/ | preload/index.ts:5, shared/types.ts:9 | 450c987 + adbf13e | ✓ | ✗ type-only |
| 4 | workspace-layout.ts | src/renderer/src/lib/ | store.ts:13, DockviewCenterTabs.tsx:36 | 450c987 | ✓ | ✗ type-only |
| 5 | ActivityBar.tsx | src/renderer/src/components/workspace/ | App.tsx:29 | 450c987 | ✓ | ✓ |
| 6 | SidePanel.tsx | src/renderer/src/components/workspace/ | App.tsx:30 | 450c987 | ✓ | ✓ |
| 7 | StatusBarWorkspaceIndicator.tsx | src/renderer/src/components/workspace/ | StatusBar.tsx:4 | 450c987 | ✓ | ✓ |
| 8 | WorkspacePresetSelector.tsx | src/renderer/src/components/workspace/ | TitleBar.tsx:3 | 450c987 | ✓ | ✓ |
| 9 | OutlinePanel.tsx | src/renderer/src/features/outline/ | DockviewCenterTabs.tsx:35 | cd91fb3 / 63bab72 | ✓ | ✓ |
| 10 | use-workspace.ts | src/renderer/src/lib/ipc/ | App.tsx:33 | 450c987 | ✓ | ✓ |
| 11 | use-appearance-effect.ts | src/renderer/src/lib/ipc/ | App.tsx:34 | 450c987 | ✓ | ✓ |
| 12 | features/outline/ (目录) | src/renderer/src/features/ | 间接(B-05 父目录) | cd91fb3 / 63bab72 | ✗ | (目录不存在,无法 import OutlinePanel) |

**总 11 个文件 + 1 个目录 = 12 个缺失项**。

---

## 范围影响表

| 状态 | 受 9 commit 影响? | 看到的 UI | 触发操作 |
|------|------|------|------|
| 项目未打开(`projectPath === null`) | 否 | WelcomeScreen(老) | 点击"新建/打开"项目 |
| 项目已打开(`projectPath !== null`) | **是** | **应用直接无法启动**(main 进程 import 阶段崩) | 进程 exit code 1,无 UI |
| 如果绕过 main 端(handler 文件补了) | **是** | renderer 端红屏 "[galide boot error]" 或侧栏全空 | React mount 前 module resolution throw |

**关键观察**: 用户报告"几乎所有边侧栏导航按钮响应错误"实际上**应用根本起不来**。之前 v1 报告没充分重视 main 端 handler 缺失(只当作类型错),实际上它是**进程启动 blocker**,优先级比 renderer 端 UI 组件更高。

---

## "如果只能回滚一个 commit,回滚哪个"

### 建议 — 回滚 `450c987` (feat(workspace_layout): 6 区域 + 3 preset in-flight 改造恢复)

**理由**:
1. **罪魁** — 引入 workspaceLayout 字段 + 6 个 renderer import + 4 个 store action 的根源 commit。其它 8 个 commit 都是 fix-on-fix(25222c2 修 handler 注册,adbf13e 修 IPC 命名空间 — 但 adbf13e 同时漏掉了 handler 实现)。
2. **回滚影响最小** — 450c987 只动 5 个文件(App.tsx/TitleBar.tsx/StatusBar.tsx/store.ts/EditorArea.tsx 删除),其它 8 个 commit 是 main process / 其他文件,回滚 450c987 不影响它们。
3. **回滚后 state**:
   - App.tsx 恢复 `TitleBar + EditorArea + StatusBar`(a1e91f8 老样子)。
   - store.ts 失去 `workspaceLayout` / `applyWorkspacePreset` / `toggleActivity` / `setRightDock` 4 个字段,但 `useUiStore` 仍有 `aiPanelOpen` 老字段,TitleBar.tsx 的 `rightDock` 调用会改成 `aiPanelOpen`(`store.ts:80 toggleAiPanel` 还在)。
   - EditorArea.tsx 文件需要 un-delete(`git checkout a1e91f8 -- src/renderer/src/app/EditorArea.tsx`)。
4. **回滚不破坏 25222c2 (tryRegister handler 隔离)** — 那个 commit 改的是 `src/main/index.ts`,与 renderer 解耦。

### 备选 — 回滚 4 个 commit: 450c987 + cd91fb3 + 63bab72 + adbf13e

如果担心 adbf13e 的"修复"被 450c987 反向依赖,可以一并回滚。这 4 个 commit 的耦合关系:
- 450c987: 引入 workspaceLayout store 字段 + 4 个 action + App.tsx 6 区域布局 + 删 EditorArea
- adbf13e: 加 IPC.asset + IPC.workspace 命名空间(声称修了 asset-handlers / workspace-handlers 但 handler 文件从未 commit)
- cd91fb3: P0 fix-on-fix(声称修了 typecheck 错但 13 个 TS2307 还在)
- 63bab72: P0 fix-on-fix(JsonComposer + AiPanel,与 workspace_layout 间接相关)

回滚这 4 个 commit 后:
- IPC 通道命名规约回到老状态(少 `IPC.asset` + `IPC.workspace` 两个命名空间,但不致命)。
- main 进程 import `./ipc/asset-handlers.js` + `./ipc/workspace-handlers.js` 消失 → **进程能启动**。
- renderer 进程 import `ActivityBar`/`SidePanel`/`workspaceLayout` 消失 → **红屏消失**。
- 状态:回到 a1e91f8 + 5 个无关修复(handler tryRegister / window open URL / errorStore LRU / ai-panel console.log / e2e test)的干净状态。

### **不要回滚 — 25222c2 + 5e1f768 + f7afd55 + c06ca2c**

这 4 个 commit 是 main 进程独立修复,跟 workspace_layout 无耦合,保留它们 OK。

---

## 验证证据

| 验证项 | 命令 | 结果 |
|------|------|------|
| node tsconfig 编译错 | `tsc --noEmit -p tsconfig.node.json` | **4 个 TS2307**(main 2 个 + preload/shared 2 个) |
| web tsconfig 编译错 | `tsc --noEmit -p tsconfig.web.json` | **11 个 TS2307**(renderer + preload + shared) |
| main 端缺失文件 | `git log --all -- 'src/main/ipc/asset-handlers.ts'` | 空输出 |
| main 端缺失文件 | `git log --all -- 'src/main/ipc/workspace-handlers.ts'` | 空输出 |
| shared 端缺失文件 | `git log --all -- 'src/shared/workspace-layout.ts'` | 空输出 |
| renderer 端缺失文件 | `git log --all -- 'src/renderer/src/components/workspace/ActivityBar.tsx'` 等 4 条 | 全空输出 |
| renderer 端缺失 hook | `ls src/renderer/src/lib/ipc/` | 16 个 .ts,**无** use-workspace.ts / use-appearance-effect.ts |
| 450c987 commit 范围 | `git show 450c987 --stat` | 只动 5 个老文件,**无新增组件** |
| adbf13e commit 范围 | `git show adbf13e --stat` | 只动 1 个文件 `src/shared/ipc-channels.ts`,**无新增 handler** |
| a1e91f8 老 App.tsx | `git show a1e91f8:src/renderer/src/app/App.tsx` | 老布局:TitleBar + EditorArea + StatusBar + AiPanel(简单) |
| a1e91f8 老 IPC channels | `git show a1e91f8:src/shared/ipc-channels.ts \| grep workspace` | 无输出,**老基线没 workspace 命名空间** |
| main/index.ts import 链 | `grep -E "registerAsset\|registerWorkspace" src/main/index.ts` | 行 13,17 import + 行 93,97 tryRegister |

---

## v1 → v2 关键升级点

| v1(被 verifier FAIL) | v2(补丁) |
|------|------|
| 11 个 TS2307(只跑 web tsconfig) | **13 个 TS2307**(node:4 + web:11,共享 2 个) |
| 只列 renderer 端缺失 | **新增 B-01/B-02**:main 端 asset-handlers.ts + workspace-handlers.ts 缺失 |
| 没明确启动失败机制 | **新增"启动失败机制"章节**:4 阶段端到端分析,main 阶段 1 就崩 |
| 没引用 adbf13e commit message 自述 | **新增 adbf13e 自述**:commit message 自证 "asset-handlers.ts:13 访问 IPC.asset.list" 但 handler 文件从未 commit |
| 9 条 bug | **13 条 bug** + 1 个目录缺失 |
| 没列 electron-vite build 影响 | **明确**:externalizeDepsPlugin 不 externalize 本地文件,所以 vite build 也会 fail |

---

## 修复优先级建议

1. **P0 必修 B-01/B-02/B-03/B-04/B-05/B-06**:补 11 个缺失文件 + 1 个目录,或选"回滚 4 commit"路线。
2. **P1 重要 B-07/B-08/B-09/B-10**:DockviewCenterTabs 适配器、clickability 测试、store 类型、StatusBar 兼容性。
3. **P2 边角 B-11/B-12/B-13**:drag-to-dock V2、git status 副产物清理、e2e 覆盖。
4. **回滚 vs 实现**:
   - **短期止血**:回滚 `450c987 + adbf13e + cd91fb3 + 63bab72`(4 commit)。理由:9 commit 集合里只有这 4 个是 workspace_layout 改造,其它 5 个(`25222c2 / 5e1f768 / f7afd55 / c06ca2c / 5b3a63f`)是无关修复。
   - **坚持 6 区域方向**:需补全 11 个缺失文件 + 6 panel 适配组件 + 适配 dockview 签名 + clickability 测试 + e2e 回归,工作量是当前 commit 集合的 5-8 倍。

---

## 为什么之前 v1 漏报 main 端

v1 只跑了 `tsc -p tsconfig.web.json`,看到 11 个 TS2307,误以为只在 renderer 端。**漏跑了 `tsc -p tsconfig.node.json`**,所以没看到 main 端 `asset-handlers.js` + `workspace-handlers.js` 的 TS2307,也没意识到 main 进程在 import 阶段就崩(比 renderer 红屏更严重 — 应用根本起不来)。

**教训**: 静态分析多进程架构(electron-vite 的 main + preload + renderer)时,**必须跑两个 tsconfig**(`tsconfig.node.json` + `tsconfig.web.json`),并交叉看 `package.json` 的 `"typecheck": "tsc ... && tsc ..."` 脚本 — 它本身就在告诉你"两个都要跑"。

v2 已补全 node tsconfig 的 typecheck,新增 B-01/B-02 + 启动期 main 进程崩溃机制 4 阶段分析。