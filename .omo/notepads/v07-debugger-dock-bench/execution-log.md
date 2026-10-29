# v07 执行日志

## 计划与排序(用户授权自行安排)
- 顺序: P0(快赢+基准,并行) → P1(文件树/ContextMenu) → P2(VM 调试器,核心) → P3(拖拽停靠) → P4(扩展 API 文档)
- 基准先行的理由:计划原文要求"无功能变更窗口",v0.6 刚结束正是窗口;P2 调试器改 VM,需前后对比(退化≤20%)

## 并发布局(6 路,按文件零重叠切分)
- T0-1 goToFile 特判 (bg_f7919679) — CommandPalette
- T0-2 i18n 决策记录 (bg_428ca16f) — docs/decisions/
- T0-3 性能基准 (bg_97d5c9e9) — scripts/bench/,沿用 spike 的自定义 vitest config 模式
- P1 文件树+ContextMenu (bg_692b1e75) — ScriptFileTree + delete IPC 链
- T2-1 VM 调试原语 (bg_0d0c9a79, ultrabrain) — shared/preview,组合式 DebugController,零成本默认
- T4-1 扩展 API 文档 (bg_6df5bb11) — docs/
- 待 T2-1 完成: T2-2 调试 UI;待 P1: 无;P3 拖拽停靠待并发降温后派
