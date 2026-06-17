#!/usr/bin/env bash
# scripts/dev.command — macOS 双击启动 Galide 开发模式
# 等价于: ./scripts/dev.sh
cd "$(dirname "$0")/.."
exec ./scripts/dev.sh
