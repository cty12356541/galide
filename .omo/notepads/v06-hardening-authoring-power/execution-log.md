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
