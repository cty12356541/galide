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

## Phase 2 ✅ (commit 25aeece, 105 文件/795 测试)
- Lane A:promise-dialog 系统(zustand pending 槽+replace-resolves-previous 防悬挂;uiStore 订阅 dismissTopModal 实现 ESC 单源);6 处迁移完成,window.prompt/confirm 0 匹配;11 新测试
- Lane A 发现:Phase 1 重接 CommandPalette 时丢了 close-project 确认,已在 dispatcher closeProject 恢复(原有文案)
- Lane B:@fontsource 三字体(inter-variable 224K + jbmono-variable 92K + noto-sans-sc 400 unicode-range 2.5M);ACCENT_MAP 四色 light/dark 三件套;--font-sans/mono 经 tailwind var 间接;reduce-motion 类+MotionConfig OR 语义;font-budget 脚本入 build(5.51MB<6MB,其中 woff2 2.87MB,其余为 woff 回退)
- Lane B 踩坑:车道间 typecheck 互相污染(A 的未提交文件让 B 的 typecheck 红)——并行车道验证应预期此现象,最终以合并后门禁为准
- T2-5:Skeleton 11 处(PanelSkeleton/FormSkeleton 变体),Loader2 保留给动作内联态;加载中文本 14→3(2 为 aria-label,1 为表单内联)

## Phase 3 进行中(三路并行)
- T3-1 (bg_7f6bed2a):CM6 编辑器内正则替换
- T3-2 (bg_2c40f711):跨文件 .gal 替换(token 边界+预览+git snapshot)
- T3-3 (bg_1e7354a8):桌面导出 spike(自定义协议,GO/NO-GO)
- 指示:worker 迭代期只跑相关测试文件,全量门禁留到最后,避免并发竞争

## Phase 3 进展
- T3-1 ✅:CM6 自带 replace UI(search panel 含替换行),补 --cm-* token 主题+4 测试。注意:CM6 API 是 regexp:true 不是 regex:true
- T3-3 ✅ GO:galgame:// 自定义协议验证通过(404 catch 必须,否则 ERR_UNEXPECTED;localStorage 可用;fetch 200;BGM 未测——Web 导出本身无音频)。证据在 .omo/spike/
- T3-4 已派出 (bg_2eee4e0e):MVP 边界=壳工程目录(main.cjs+package.json+嵌入 Web 导出+README),不做 electron-builder/签名/安装器;ExportDialog 解锁按钮;smoke 用 repo 的 electron 跑
- T3-2 跨文件替换仍在进行 (bg_2c40f711)

## T3-2 验收通过(未提交)
- 前一 worker 超时于收尾,我直接验证:tsc 双 config 0 错;5 个相关测试文件 53 测试全绿
- 机制确认:apply 先 gitService.snapshot(复用 agent 安全闸),失败带 snapshotRef 可 rollback;token 模式负向测试齐(散文"艾艾子今天去了艾河边"3 处全不命中,plain 对照命中)
- T3-4 首派超时(疑死于 live Electron smoke),重派 bg_ca8dfbab:收窄为 composer+模板+静态测试,live smoke 改 env-gated(GALIDE_E2E_ELECTRON=1)由我最后跑
- 教训:让 worker 在 macOS GUI 跑 Electron  smoke 风险高(可能挂起);env-gated + orchestrator 收尾更稳
