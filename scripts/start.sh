#!/usr/bin/env bash
#
# scripts/start.sh — 启动 Galide 开发模式(已装依赖后)
#
# 等价于: pnpm dev
# 启动 Electron + Vite dev server
# Ctrl+C 退出

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [[ -t 1 ]]; then
  BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
else
  BLUE='' BOLD='' RESET=''
fi

# 检查依赖
if [[ ! -d "node_modules" ]]; then
  echo -e "${BOLD}未装依赖,先跑:${RESET} pnpm install"
  exit 1
fi

# 检查 pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  echo "未检测到 pnpm"
  exit 1
fi

echo -e "${BLUE}${BOLD}==>${RESET} ${BOLD}启动 Galide (pnpm dev)${RESET}"
echo -e "提示: Ctrl+C 退出"
echo
pnpm dev
