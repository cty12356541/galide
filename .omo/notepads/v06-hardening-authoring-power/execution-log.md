# v06-hardening 执行日志

## Phase 0 ✅ (commit 580f781)
- 2 个负向测试 cast 修复(`as unknown as Expression`),四门禁全绿,726 测试
- 基线提交 38 文件 +1884/-100(用户在途工作:表达式联合/voice-sidecar/multimodal/key-store/inline-edit/save)
- 注意:.omo 未被 gitignore,计划与证据文件也被提交了;phase0-gate.log 因 *.log 规则未入提交

## Phase 1 进行中
- T1-1+T1-2 ✅:registry 28 命令(+10 新 id:find/saveScript/toggleTheme/preset×3/aiDock×3/floatAi),keywords 全填,toggleAi.default='Meta+L';复用既有 command-dispatcher.ts(Map 注册),新建 hooks/use-command-dispatcher.ts(Record<CommandId, handler> 穷尽映射,缺映射=编译错);use-keyboard-shortcuts 全走 dispatcher;⌘S/⌘F 保留 CodeMirror 双执行体语义。735 测试绿
- T1-3/T1-4/T1-5 三个并行 worker 已发出(bg_88f30d6a / bg_be81f7ea / bg_b7957fb8)
- 教训:既有 command-dispatcher.test.ts 已存在——委派前应先 grep dispatcher 概念,避免平行实现(本次 worker 正确选择了扩展而非新建)
- main 端 command-tools.ts 的 agent 命令枚举未动(Phase 1 仅渲染端),后续若加命令需同步

## Phase 1 ✅ (commit c150b06, 101 文件/767 测试)
- T1-3 MenuBar:菜单组改为注册表分类(项目/文件/编辑/视图/跳转与命令+帮助),testid 改稳定 key(menu-{category}),10 测试
- T1-4 CommandPalette:28 命令全量接入+keywords 搜索+快捷键提示,6 测试;已知边缘:面板内选"跳转到文件"会关闭而非切模式(⌘P 不受影响),待用户决定是否特判
- T1-5 Toolbar:6 按钮全映射 CommandId,6 测试
- T1-6 漂移守卫:10 测试,glyph 扫描 allowlist 为空(PreviewCanvas/CommandPalette 的字面量都改为派生);负向测试验证过会红
- 事故:T1-6 worker 用 git checkout 回滚探针时误删 Toolbar 未提交改动,从 opencode 快照恢复(6/6 测试验证)。教训:给 worker 的 MUST NOT 里 git checkout 要更醒目;考虑让 worker 用 patch 文件而非 git 回滚
- 教训:三 worker 并发跑 pnpm test 触发 verify-deps-before-run 安装+CPU 竞争,验证阶段拖长;后续验证指示统一用 ./node_modules/.bin/vitest run 直跑

## Phase 2 进行中(双车道)
- Lane A (bg_0e4fb858):统一 confirm/prompt dialog + 迁移 6 处原生 prompt/confirm
- Lane B (bg_c77dcf84):@fontsource 内置字体(unicode-range 分子集)+ accent/字体/reducedMotion 偏好兑现
- T2-5 Skeleton 等 Lane A 完成后启动(AssetListPanel/VoicePanel 文件重叠)
