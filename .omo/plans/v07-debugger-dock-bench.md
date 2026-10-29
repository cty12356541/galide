# Galide v0.7 — 调试器·停靠·基准计划

> 制定时间: 2026-07-19
> 上游依据: v0.6 计划延期清单 + 深度评审战略项;用户指示"继续下一阶段,自行安排顺序"
> 排序逻辑: 基准先行(无功能变更窗口) + 快赢清尾 → UX 结构 → 核心价值(VM 调试器) → 结构改造(拖拽) → 战略文档
> 执行原则: 与 v0.6 相同——阶段原子提交;worker 迭代期只跑相关测试;全量门禁在阶段末;禁止 git 破坏性操作

## 范围

| 阶段 | 内容 | 性质 |
|---|---|---|
| Phase 0 | goToFile 特判 + i18n 决策记录 + 性能基准套件 | 快赢+基线,三路并行 |
| Phase 1 | 文件树嵌套/删除启用 + Radix ContextMenu | UX 结构 |
| Phase 2 | VM 领域调试器:变量监视 + marker 断点 | 核心价值(最大) |
| Phase 3 | 面板拖拽停靠(HTML5 DnD + panelStates 改造) | 结构改造 |
| Phase 4 | 扩展 API 设计文档(docs/extension-api.md,只设计不实现) | 战略 |

**明确不做**: i18n 实现(仅决策记录);扩展 API 实现(仅设计);桌面壳 electron-builder 打包(上阶段已定义边界);协作编辑。

---

## Phase 0 — 快赢与基线(三路并行)

### T0-1 命令面板 goToFile 特判
- **背景**: Phase 1 收敛后面板内选「跳转到文件」按 dispatch-then-close 关闭面板而非切模式;⌘P 正常
- **修复**: CommandPalette onSelect 对 `goToFile` 特判——先 dispatch 后不再 close(或 dispatch 后保持开启);加组件测试锁定
- **验收**: 面板内选「跳转到文件」→ 切到文件模式;其他命令仍 dispatch-then-close;相关测试绿

### T0-2 i18n 决策记录
- **产物**: `docs/decisions/i18n.md`——决策:DSL 永久中文(产品身份);UI 层 i18n 仅在有海外用户证据时启动,届时走"字符串抽出 + zh-CN 默认包"路径;列出触发条件与非目标
- **验收**: 文档存在,含决策/理由/触发条件/非目标四节

### T0-3 性能基准套件
- **产物**: `scripts/bench/`(或 vitest bench)覆盖四个基准,结果写 `.omo/bench/baseline.json`:
  1. 万行 .gal parse + 诊断耗时(用 DSL 生成器造 fixture)
  2. runtime-vm 推进 1000 节点耗时(playback-timeline)
  3. Web 导出耗时(中型 fixture 项目)
  4. merged AST 构建耗时(parse-project-scripts,10 文件 × 1000 行)
- **约束**: 可重复(固定 fixture,种子化);CI 可跑(node 环境,不依赖 Electron/GUI);输出含 p50/p95
- **验收**: `node scripts/bench/run.mjs`(或 pnpm bench)exit 0 并产出 baseline.json;每个基准打印数值

### Phase 0 门禁 + 提交
- `pnpm typecheck && pnpm lint && pnpm test` 绿 → 提交

---

## Phase 1 — 文件树与 ContextMenu

### T1-1 文件树嵌套 + 删除启用
- **现状**: ScriptFileTree 是扁平列表(仅 scripts/ 根);删除菜单项禁用("暂未启用")
- **执行**: 支持 scripts/ 子目录树形展示(缩进/折叠,不需要复杂树组件);启用删除(复用 v0.6 promise confirm,danger);main 端 delete script IPC(若无)+ zod schema + preload + hook(全链按 .style-spec)
- **验收**: 子目录 .gal 正确嵌套展示;删除经确认后文件消失且列表刷新;rg '暂未启用' ScriptFileTree 相关区域 0 匹配;测试覆盖

### T1-2 Radix ContextMenu 替换手搓菜单
- **现状**: ScriptFileTree 右键菜单手搓(fixed 定位 div,无键盘导航/ARIA/视口边缘处理)
- **执行**: 安装 @radix-ui/react-context-menu,按 components/ui 模式封装 context-menu.tsx(token 化样式参照 dropdown-menu),替换手搓实现;键盘导航/焦点管理/ARIA 由 Radix 免费提供
- **验收**: 右键菜单键盘可达(方向键/ESC);视口边缘不溢出;组件测试(打开/键选/触发动作);原手搓代码删除

### Phase 1 门禁 + 提交

---

## Phase 2 — VM 领域调试器(核心)

> 目标:让预览从"播放器"升级为"调试器"。复用现有骨架:src/shared/preview/runtime-vm.ts(状态机)、playback-timeline.ts(文档序推进)、vm-save.ts(存档位)、PreviewCanvas/PreviewRuntime(PixiJS)。

### T2-1 VM 调试原语(runtime 层)
- **执行**: runtime-vm 增加:
  a. **断点表**:marker 名集合(或 scene+行);`step()` 推进时命中即暂停(pausedAt 状态 + 命中信息)
  b. **变量快照**:`getVariables()` 返回当前变量表副本(设:/若: 求值上下文已有)
  c. **watch 订阅**:变量变更时回调(供 UI 实时刷新)
  d. 断点续走:`continue()` 从暂停点继续;单步保持现有语义
- **验收**: VM 单测——断点命中暂停/不命中不停/continue 恢复/变量快照内容正确/watch 回调触发;含 [若:] 条件分支中的变量演进用例

### T2-2 调试 UI(preview feature)
- **执行**:
  a. **断点管理**:SceneRail 或 Outline 中 marker 行可设断点(点击 gutter/右键;红点标识,store 持久化到 localStorage 即可)
  b. **变量监视面板**:preview 侧栏新子岛(或 PreviewCanvas 侧栏区)——watch 列表(用户可加任意变量名)+ 全变量表(可折叠);值变更时高亮闪变
  c. **调试控制条**:继续/单步/停止;断点命中时 banner 显示命中 marker
- **验收**: 组件测试(设断点→播放→命中暂停→变量表显示→继续);视觉与 visual-tokens.md 一致;共享组件复用 PanelHeader/EmptyState

### T2-3 回归:基准对比
- **执行**: 重跑 T0-3 基准套件,VM 推进耗时不退化超 20%(调试钩子默认零成本——无断点/无 watch 时不得引入开销)
- **验收**: 对比表写入 .omo/bench/after-debugger.json;退化>20% 则需优化至达标

### Phase 2 门禁 + 提交

---

## Phase 3 — 面板拖拽停靠

### T3-1 拖拽基础设施
- **执行**: 原生 HTML5 DnD(不引依赖):PanelHeader 可拖拽(dragstart 携带 panelId);dock 区域(左/右/底/浮出按钮)为 drop target(dragover 高亮,drop 调 dockSide 迁移逻辑);与现有 DockedLocationMenu 同一 action(复用 workspace-store 的迁移函数,不另造语义)
- **验收**: 拖拽面板到另一 dock → panelStates 更新且布局持久化;拖拽过程有视觉反馈;DockedLocationMenu 菜单路径仍可用(双通道)

### T3-2 边界与测试
- **执行**: 不允许的 drop(如 editor 文档面板拖到 tool dock,或反向)显示禁止标识;浮出上限规则与拖拽一致;组件测试(store 层断言)
- **验收**: 非法 drop 被拒绝且视觉提示;测试绿

### Phase 3 门禁 + 提交

---

## Phase 4 — 扩展 API 设计文档

### T4-1 docs/extension-api.md
- **内容**: 盘点 tool-registry 现有 ~15 工具;提出冻结的最小公开面(工具签名/上下文/权限分级/错误契约);安全模型(平台命令工具的闸门);版本策略;一个示例社区工具(端到端走一遍注册→调用→结果)。明确非目标(不开放 UI 扩展/不做市场)
- **验收**: 文档齐备;经一轮 oracle 或自查评审;提交

---

## 完成定义(全局 DoD)

- [ ] 四门禁全绿,阶段提交链清晰
- [ ] 基准 baseline.json + after-debugger.json 存在,VM 退化 ≤20%
- [ ] 面板内 goToFile 行为正确;文件树嵌套+删除可用;ContextMenu 键盘可达
- [ ] VM 断点/变量监视测试齐备;调试 UI 符合 visual-tokens
- [ ] 拖拽停靠双通道(拖拽+菜单)一致语义,非法 drop 被拒
- [ ] docs/decisions/i18n.md 与 docs/extension-api.md 落地
