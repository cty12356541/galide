#!/usr/bin/env bash
#
# scripts/dev.sh — Galide 一键构建启动脚本
#
# 流程:
#   1. 检查 pnpm (没有则提示)
#   2. pnpm install
#   3. pnpm typecheck
#   4. pnpm lint
#   5. pnpm test
#   6. pnpm build
#   7. pnpm dev
#
# 环境变量:
#   SKIP_INSTALL=1   跳过 pnpm install
#   SKIP_CHECKS=1    跳过 typecheck/lint/test
#   SKIP_BUILD=1     跳过 pnpm build
#   SKIP_DEV=1       跳过 pnpm dev(只跑前置检查)
#
# 退出码:
#   0  全部成功
#   非0 任一阶段失败

set -euo pipefail

# 颜色(只在 TTY 输出)
if [[ -t 1 ]]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' BLUE='' BOLD='' RESET=''
fi

# 切到项目根(脚本所在目录的上一级)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# 进度提示
step() {
  echo -e "\n${BLUE}${BOLD}==>${RESET} ${BOLD}$*${RESET}"
}

ok() {
  echo -e "${GREEN}✓${RESET} $*"
}

warn() {
  echo -e "${YELLOW}!${RESET} $*"
}

fail() {
  echo -e "${RED}✗${RESET} $*"
  exit 1
}

# 检查 pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  warn "未检测到 pnpm,尝试用 corepack 启用"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@latest --activate
  else
    fail "未安装 pnpm。请先运行: npm install -g pnpm"
  fi
fi

# 1. install
if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  step "1/6  装依赖 (pnpm install)"
  pnpm install
  ok "依赖装好"
else
  warn "跳过 pnpm install (SKIP_INSTALL=1)"
fi

# 2. typecheck
if [[ "${SKIP_CHECKS:-0}" != "1" ]]; then
  step "2/6  类型检查 (pnpm typecheck)"
  pnpm typecheck
  ok "类型 0 error"
else
  warn "跳过 typecheck/lint/test (SKIP_CHECKS=1)"
fi

# 3. lint
if [[ "${SKIP_CHECKS:-0}" != "1" ]]; then
  step "3/6  代码检查 (pnpm lint)"
  pnpm lint
  ok "Lint 0 error"
fi

# 4. test
if [[ "${SKIP_CHECKS:-0}" != "1" ]]; then
  step "4/6  跑测试 (pnpm test)"
  pnpm test
  ok "测试全过"
fi

# 5. build
if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "5/6  构建产物 (pnpm build)"
  pnpm build
  ok "构建成功"
else
  warn "跳过 pnpm build (SKIP_BUILD=1)"
fi

# 6. dev
if [[ "${SKIP_DEV:-0}" != "1" ]]; then
  step "6/6  启动开发模式 (pnpm dev)"
  echo -e "${YELLOW}提示: Ctrl+C 退出${RESET}"
  pnpm dev
else
  warn "跳过 pnpm dev (SKIP_DEV=1)"
  echo -e "\n${GREEN}${BOLD}全部就绪,可执行: pnpm dev${RESET}"
fi
