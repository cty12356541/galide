/**
 * vm-history — 兼容入口
 *
 * 历史栈相关实现已迁移到 runtime-vm-player.ts,本文件仅保留重导出,
 * 避免修改现有 import 路径。
 */
export { MAX_VM_HISTORY, pushHistory, stepBack } from './runtime-vm-player'
export type { VmHistoryEntry } from './runtime-vm-player'
