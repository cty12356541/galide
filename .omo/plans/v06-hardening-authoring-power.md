# Galide v0.6 — 加固与创作力提升计划

> 制定时间: 2026-07-18
> 上游依据: 深度评审报告(2026-07-18)+ Metis 咨询(ses_08fa48ae9ffeSH6bS2ljNjrl4I)
> 用户已确认的 4 个决策: ① 授权计划代提交在途工作基线 ② 死偏好实现兑现 ③ 桌面导出按 MVP 边界执行 ④ 范围 = P0 + P1 + P2 快赢,结构性 P2 记入延期清单
> 执行原则: 每阶段原子提交(仅提交本阶段触碰的文件);除 Phase 0 基线提交外,严禁对工作区做任何 git checkout/restore/stash/clean/commit -a

---

## 0. 背景与目标

深度评审结论:galide 哲学自洽、AI agent 架构达标、726 测试全绿,但存在 UX 执行层裂缝(死偏好/快捷键漂移/原生 dialog)、桌面分发 stub、创作高频功能(搜索替换)缺失。本计划将评审的 P0/P1/P2快赢转化为 5 个阶段的可执行任务,每个验收标准均可由 agent 自动执行,零用户介入。

**范围**: P0 全部 + P1 全部 + P2 快赢(流浪文件/状态灯/README 诚实化)。
**明确排除**(延期清单,见 §7): VM 调试器、i18n、文件树嵌套/删除、Radix ContextMenu、拖拽停靠、性能基准、扩展 API。

**全局 MUST NOT**(每个 worker 继承):
- 禁止 git checkout/restore/stash/clean/commit -a 操作预先存在的脏树;仅允许 Phase 0 的基线提交和各阶段原子提交
- 禁止触碰 `~/.config/opencode/`(僵尸计划域)
- 禁止新增 findings 之外的功能
- 禁止用凑数测试填充测试数;禁止新增 zod IPC schema"以防万一"(偏好持久化已存在,应用层纯渲染端)
- 禁止使用 `as any`/`@ts-ignore`;表达式测试修复用 `as unknown as Expression`(负向测试的有意 cast)

---

## Phase 0 — 解锁与基线 (~0.5d)

### T0-1 修复 2 个 typecheck 错误
- **文件**: `src/main/export/expression-to-ink.test.ts:68`、`src/main/export/expression-to-renpy.test.ts:69`
- **现状**: 负向测试 `const fakeExpr = { kind: 'unknown' } as { kind: string }`,在 `Expression` 变为判别联合(`ExprLiteral | ExprVar | ExprUnary | ExprBinary`,`src/shared/dsl/expression.ts:32`)后不再满足参数类型
- **修复**: 改为 `as unknown as Expression`(保持负向测试语义:运行时 throw)
- **验收**: `pnpm typecheck` exit 0

### T0-2 全门禁验证
- **执行**: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- **验收**: 全部 exit 0;测试 ≥726 pass;输出存档 `.omo/evidence/phase0-gate.log`

### T0-3 在途工作基线提交
- **前置**: T0-2 全绿
- **执行**: `git add -A && git commit` —— 一次性基线提交,消息概括在途功能(表达式联合类型 + voice-sidecar + multimodal-tools + key-store + AiInlineEdit + 保存链路)
- **MUST NOT**: 不拆分、不改写内容、不 fixup 历史
- **验收**: `git status --short` 为空;`git log -1 --stat` 覆盖全部 24+ 个原脏文件

### T0-4 归档僵尸 boulder plan + 注册新 work_id
- **执行**: 将 `complete-oh-my-openagent-config` 标记 archived(它属于 OpenCode Desktop 配置域,需用户手动重启验证,agent 无法完成);本计划注册新 work_id `galide-v06-hardening`
- **验收**: `.omo/boulder.json` 的 `active_work_id` 指向新 work_id

---

## Phase 1 — P0 快捷键/命令收敛 (~1.5d)

> 目标:command-registry 成为菜单/工具栏/命令面板的唯一事实来源,并有漂移守卫测试防止复发。
> 已知事实(Metis 核实):registry 已有 `COMMANDS`(id/label/default/category/icon/requiresProject)、`acceleratorLabel()`、`effectiveShortcut()`、`CATEGORY_LABELS/ORDER`;缺 dispatcher、缺部分 CommandId(如"查找")、缺 keywords。Toolbar 有 4 处硬编码提示(⌘⇧C/⌘E/⌘L/⌘,,`Toolbar.tsx:56-84`);`PreviewCanvas.tsx:355` 有展示用 `<kbd>⌘N</kbd>`。

### T1-1 扩展 registry schema
- **文件**: `src/renderer/src/lib/command-registry.ts`
- **执行**: ① 补齐缺失 CommandId(至少 `find`/查找,MenuBar 的 ⌘F `focusEditorAndSearch` 当前无 registry 项)② 增加可选 `keywords?: string[]` 供面板模糊搜索 ③ `toggleAi.default` 从 `null` 改为 `'Meta+L'`(使 Toolbar 提示为真,对齐 Cursor/Claude 惯例)
- **验收**: `pnpm typecheck` exit 0;registry 单测绿

### T1-2 实现 useCommandDispatcher hook
- **文件**: 新建 `src/renderer/src/lib/hooks/use-command-dispatcher.ts`
- **设计**: CommandId → handler 映射放在 hook 内(不放进 registry 本体,避免 store→registry 循环依赖);handler 复用现有 action 实现
- **MUST**: 先确认 `use-keyboard-shortcuts.ts` 已 dispatch `toggleAi`,缺失则补 case
- **验收**: 每个 registry 命令都有 handler 或有显式 `external: true` 标记;`vitest run src/renderer/src/lib/hooks/use-command-dispatcher*` 绿

### T1-3 重接 MenuBar
- **文件**: `src/renderer/src/app/MenuBar.tsx`
- **执行**: 菜单项从 `COMMANDS` 派生(分组用 CATEGORY_ORDER);快捷键标签一律 `acceleratorLabel(effectiveShortcut(id, userShortcuts))`;删除全部硬编码 '⌘N' 类字面量
- **验收**: MenuBar 快照测试断言菜单项 == registry 派生列表;用户重绑定后菜单标签随之变化(组件测试)

### T1-4 重接 CommandPalette
- **文件**: `src/renderer/src/features/command-palette/CommandPalette.tsx`
- **执行**: 删除手工复制的命令列表,改为消费 `COMMANDS`(分组/图标/keywords 搜索);每项展示 `acceleratorLabel` 快捷键提示;保留双模式(命令/跳转文件)与 scene 跳转
- **验收**: Playwright:打开 ⌘K 面板,命令数 == `COMMANDS.length`,每项显示快捷键标签

### T1-5 重接 Toolbar
- **文件**: `src/renderer/src/app/Toolbar.tsx`
- **执行**: 4 处 title 提示(行 56-84)全部改为 registry 派生;`toggleAi` 提示即真实绑定
- **验收**: Playwright:AI 按钮 tooltip == registry 计算的 `⌘L`

### T1-6 漂移守卫测试
- **文件**: 新建 `src/renderer/src/lib/command-registry.drift.test.ts`
- **执行**: ① 断言 MenuBar/palette 项源自 `COMMANDS` ② 用 rg 类扫描断言 `src/renderer/src/{app,features}` 下(排除测试)无 `⌘|⇧|⌥` 字面量,**allowlist 机制**放行 `PreviewCanvas.tsx:355`(或顺手将其改走 `acceleratorLabel`,优先)
- **验收**: `rg '⌘|⇧|⌥' src/renderer/src/app src/renderer/src/features --glob '!**/*.test.*'` 仅返回 allowlist 行;守卫测试绿
- **依赖**: 必须在 T1-3/4/5 之后(当前代码必然失败)

### Phase 1 验收 + 原子提交
- `pnpm typecheck && pnpm lint && pnpm test` 全绿 → 提交本阶段触碰文件

---

## Phase 2 — P1 UI 正确性 (~2d)

> 目标:消灭原生 dialog、兑现死偏好、内置字体、启用 Skeleton。
> 依赖:T2-3(字体)在 T2-4(偏好应用)之前;本阶段编辑 CommandPalette 的 close-project 确认,必须在 Phase 1 完成后。

### T2-1 统一 promise 式 dialog hooks
- **文件**: 新建 `src/renderer/src/components/ui/confirm-dialog.tsx` + `prompt-dialog.tsx` + 对应 hooks(`useConfirmDialog`/`usePromptDialog`)
- **设计**: 样式参照 `src/renderer/src/features/ai-panel/agent-confirm-diff.tsx`;promise 化(resolve 值/reject 取消);一次建成,禁止 6 处各自发明 modal
- **验收**: 组件测试覆盖 resolve/reject 路径;Radix Dialog 语义(role/aria-modal/焦点陷阱)

### T2-2 迁移 6 处 window.prompt/confirm
- **文件**: `ScriptFileTree.tsx:81,109`、`use-new-script-file.ts:21`、`CommandPalette.tsx:199`、`CharacterListPanel.tsx:59`、`AssetListPanel.tsx:99`、`VoicePanel.tsx:90`
- **执行**: 调用点改为 `await usePromptDialog(...)`;注意原 prompt 是同步阻塞,迁移后异步流不许静默改语义(重命名流程需 await 结果再继续)
- **验收**: `rg 'window\.(prompt|confirm)' src/` 0 匹配;Playwright:在 ScriptFileTree 重命名 fixture `测试场景.gal` 成功;既有测试全绿

### T2-3 内置字体
- **文件**: `src/renderer/src/styles/global.css` + 字体资产 + `tailwind.config.js`
- **执行**: 自托管 `@font-face`(无 CDN):**subsetted** Noto Sans SC(全量 CJK 8-10MB+,必须子集化)+ JetBrains Mono + Inter(可变字重);走 Vite 资产管线
- **验收**: `document.fonts.check('12px "JetBrains Mono"')` 为 true(Playwright);`pnpm build` 后字体资产体积断言(预算 <3MB,写进 QA 脚本)

### T2-4 兑现外观偏好(accent/字体/reducedMotion)
- **文件**: 新建 `src/renderer/src/lib/ipc/use-appearance-preferences.ts`(或并入 use-appearance-effect)+ `global.css`
- **执行**: 启动时与设置变更时应用 CSS 变量:accent 四色映射(violet/blue/rose/emerald → `--accent` 及派生)、`--font-sans/--font-mono`、reducedMotion → 覆盖 `prefers-reduced-motion`;纯渲染端,不新增 IPC
- **验收**(Playwright computed-style,含**重启后持久化**):accent=rose 时 `getComputedStyle(document.documentElement).getPropertyValue('--accent')` == 预期值;mono 字体生效;reducedMotion 开关改变动画行为

### T2-5 Skeleton 启用 + 加载态清扫
- **文件**: `components/ui/skeleton.tsx`(已存在,零引用)+ 21 处裸 "加载中…"/Loader2 调用点
- **执行**: 面板级加载换 Skeleton(EditorCore 的 Suspense fallback、Git/Voice/Asset 面板等);按钮内联加载保留 Loader2(合理)
- **验收**: skeleton.tsx 被 ≥5 处引用;visual QA 截图无"加载中…"文本态残留(Suspense 边界除外需评估)

### Phase 2 验收 + 原子提交
- 四门禁全绿 → Playwright visual QA(明暗主题 + 各改动面板截图)→ 提交

---

## Phase 3 — P1 创作力 (~4-6d)

### T3-1 编辑器内正则替换
- **文件**: `ScriptEditor.tsx` + CodeMirror search 扩展
- **执行**: CM6 `@codemirror/search` 的 replace 已内置,确认开启并接通 UI(快捷键走 registry);验证捕获组替换 `$1`
- **验收**: 组件/集成测试:`foo(\d+)` → `bar$1` 在单文件生效

### T3-2 跨文件替换(限 .gal)
- **文件**: `features/search/ScriptSearchPanel.tsx` + `shared/dsl/search-project-scripts.ts` + 新建替换服务(main 端)
- **设计约束**(防 R5 腐化 canonical artifact):
  - 仅 `.gal` 文件;不动资产/二进制
  - 标识符整体匹配(角色改名不得命中台词文本内的子串)——基于 lexer token 边界而非裸字符串
  - 应用前展示 match 预览 + 确认(复用 T2-1 confirm)
  - 应用前 git snapshot(复用 agent 的 snapshot/rollback 模式;项目根即 git 仓库)
- **验收**(vitest fixtures):角色 `艾` 跨 3 个 fixture .gal 改名 → 文件内容断言 + snapshot 文件存在断言 + 负向用例(台词散文中的"艾"子串未被替换)

### T3-3 桌面导出 spike(≤0.5d,时间盒)
- **目标**: 验证"Web 导出 + 最小 Electron 壳"的资产加载可行性
- **执行**: 最小壳 main 进程 + 自定义 protocol handler(已知 file:// 破坏 PixiJS/fetch);用 fixture 项目验证
- **验收**(二值): 壳内首个场景文本渲染 + 资产请求零失败 → GO;失败 → 记录原因,任务降级为"文档化 stub 原因",**禁止** heroic 升级
- **MUST NOT**: 不签名、不做 auto-updater、不做 DMG/安装器、不做 Linux;不盲目复用 IDE 自身的 `electron-builder.yml`(可借鉴模式,不可混用配置)

### T3-4 桌面导出 MVP(依赖 T3-3 = GO)
- **文件**: `src/main/export/electron-desktop-composer.ts`(当前 throw NOT_IMPLEMENTED)+ 新建 shell 模板
- **执行**: composer 输出 = Web 导出产物 + 壳工程;ExportDialog 解锁按钮;产物 = macOS + Windows zip(未签名)
- **验收**(smoke 脚本): fixture 项目导出 → 打包 → Playwright Electron 启动 → 断言窗口标题 + 首场景台词渲染

### Phase 3 验收 + 原子提交
- 四门禁全绿 → 提交

---

## Phase 4 — 卫生与诚实化 (~0.5d)

### T4-1 流浪文件清理
- 删 `test_scene.ts`(根目录调试残留);清理 `.worktrees/` 残留(**先 `git worktree list` 核对,仅删未注册目录**)
- 验收: `test -f test_scene.ts` 失败;`git worktree list` 输出与目录一致

### T4-2 StatusBar AI 状态灯诚实化
- **文件**: `src/renderer/src/app/StatusBar.tsx`
- **执行**: 绑定真实 agent 循环状态(idle/running/error,来自 agent IPC 状态),或移除该灯;**禁止**换一种假启发式(如按 lint 状态上色)
- **验收**: 组件测试注入 idle/running/error 三态,断言灯色与文案;不再出现硬编码 "AI 空闲"

### T4-3 README 诚实化
- **文件**: `README.md`
- **执行**: "React 18" → React 19;删除硬编码测试数(80+/530+ 与 96/726)改为 CI badge 或"以 CI 为准"表述;"typecheck 0 error" 改为 CI 强制声明;Electron-desktop 状态按 Phase 3 结果更新
- **MUST NOT**: 禁止把数字换成新的硬编码数字(下月又腐化)
- **验收**: `rg 'React 18|530\+|80\+' README.md` 0 匹配;CI 工作流绿

### Phase 4 验收 + 最终提交
- 四门禁全绿;`.omo/evidence/` 汇总各阶段证据

---

## 7. 延期清单(Deferred Backlog,本计划明确不做)

| 项 | 延期理由 |
|---|---|
| 预览 VM → 领域调试器(变量监视 + marker 断点) | 自成一个里程碑,需独立设计 |
| i18n | 决策记录:若做仅 UI 层,DSL 保持中文;全量 i18n 与产品"中文优先"身份冲突 |
| 文件树嵌套/删除启用 + Radix ContextMenu | 与 Phase 2 dialog 迁移部分正交,单独小迭代 |
| 面板拖拽停靠 | 需要 dock 模型改造,v0.7 |
| 性能基准套件(启动/首帧/万行 .gal parse) | 独立任务,需在无功能变更窗口做 |
| tool-registry → 公开扩展 API | 战略决策,需先冻结最小 API 面 |

---

## 8. 依赖图与并行策略

```
Phase 0 (串行,一切前置)
  └─ Phase 1 (T1-1→T1-2→[T1-3∥T1-4∥T1-5]→T1-6)
       └─ Phase 2 (T2-1→T2-2;T2-3→T2-4;T2-5 独立 ∥)
            └─ Phase 3 (T3-1→T3-2;T3-3→T3-4;两支线可 ∥)
                 └─ Phase 4 (T4-1∥T4-2∥T4-3)
```

- 阶段间严格串行(门禁 + 原子提交为界)
- 阶段内标注 ∥ 的可并行 worker;CommandPalette 在 Phase 1/2 被两次编辑,禁止跨阶段并行

## 9. 完成定义(全局 DoD)

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 全绿
- [ ] `git status` 干净,历史为:基线提交 + 4 个阶段提交
- [ ] 快捷键字面量扫描仅 allowlist;`window.prompt|confirm` 0 匹配;README 无腐化字符串
- [ ] Playwright:面板快捷键标签 == registry;偏好 computed-style 生效且重启持久化;字体加载断言通过
- [ ] 跨文件替换 fixture 测试(含负向用例)通过;桌面导出 smoke(T3-3 GO 时)通过
- [ ] `.omo/evidence/` 含各阶段门禁输出与截图
