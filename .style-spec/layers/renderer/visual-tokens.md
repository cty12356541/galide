# Galide 视觉规约(v0.5 起强制)

> 收敛过去 4 个版本里散落的"差不多就行"硬编码颜色 / 高度 / 圆角,
> 落地为 token + 共享件。本规约是 PR review 的"硬约束"。

---

## 1. 表面 4 级(`background`)

| Token | Tailwind 类 | 用途 |
|---|---|---|
| `--bg` | `bg-bg` | 应用最底色(状态栏、Activity Bar 等深一档) |
| `--canvas` | `bg-canvas` | 主区画布(Mosaic 容器),给"纸张 space" |
| `--surface` | `bg-surface` | Panel / Dialog / Tooltip / Toast |
| `--bg-elevated` | `bg-bg-elevated` | Panel 头、chip、toolbar 浮起一档 |

> 绝不允许 `bg-white / bg-gray-50 / bg-stone-100` 等裸 Tailwind 调色板。

## 2. 边框 2 级(`border`)

| Token | 类 | 用途 |
|---|---|---|
| `--border` | `border-border` | 一般分割线、card 边框、input 边框 |
| `--border-strong` | `border-border-strong` | 状态栏分割、active 强调边 |

## 3. 文字 2 级(`text`)

| Token | 类 | 用途 |
|---|---|---|
| `--text` | `text-text` | 主文字 |
| `--text-muted` | `text-text-muted` | 副文字、label、placeholder |

## 4. Accent 1 个 + 4 个语义色

| 角色 | 类 | light | dark |
|---|---|---|---|
| accent | `bg-accent` / `text-accent` | `#6366f1` | `#818cf8` |
| accent hover | `bg-accent-hover` | `#4f46e5` | `#6366f1` |
| accent soft | `bg-accent-soft` | `#eef2ff` | `#1e1b4b` |
| danger | `bg-danger` / `text-danger` | `#dc2626` | `#f87171` |
| danger strong | `text-danger-strong` | `#991b1b` | `#fecaca` |
| danger soft | `bg-danger-soft` | `#fef2f2` | `#450a0a` |
| warning | `bg-warning` / `text-warning` | `#d97706` | `#fbbf24` |
| warning strong | `text-warning-strong` | `#92400e` | `#fde68a` |
| warning soft | `bg-warning-soft` | `#fffbeb` | `#451a03` |
| success | `bg-success` / `text-success` | `#059669` | `#34d399` |
| success strong | `text-success-strong` | `#065f46` | `#a7f3d0` |
| success soft | `bg-success-soft` | `#ecfdf5` | `#022c22` |

> 4 个语义色是"信号"(error / warn / ok / accent),"低对比"-soft 是底色,
> "高对比"-strong 是文字。**写作时用 `text-*-strong 配 bg-*-soft`**,dark mode 下自动切。

## 5. 圆角 4 档

| 类 | px | 用途 |
|---|---|---|
| `rounded-sm` | 6 | 小 chip、tag |
| `rounded-md` | 10 | button、input |
| `rounded-xl` | 12 | panel、island、card(主) |
| `rounded-2xl` | 16 | dialog、modal、welcome screen |

## 6. 高度 4 档

| 类 | px | 用途 |
|---|---|---|
| `h-7` | 28 | chip、tag、tabular 单元 |
| `h-8` | 32 | sub-header(子 section) |
| `h-9` | 36 | panel header(主)、toolbar、MenuBar |
| `h-10` | 40 | panel header(带 actions/tabs) |

> 9/10 二选一时,默认 `h-9`;只有需要放下 tab chips 才用 `h-10`。

## 7. 阴影 4 档

| 类 | 用途 |
|---|---|
| `shadow-none` | 完全扁平 |
| `shadow-sm` | button hover、card 静止 |
| `shadow`(DEFAULT = panel) | ToolWindow / Mosaic 浮起 |
| `shadow-md` | 浮窗、popover |
| `shadow-lg` | dialog |
| `shadow-2xl` | command palette 中心弹窗 |

## 8. Island focus 退让

非焦点 island 退让一档,焦点 island 升一档,中间过渡 180ms:

```css
.island { transition: opacity 180ms, filter 180ms, box-shadow 180ms; }
.island:not(:focus-within) { opacity: 0.93; filter: saturate(0.88); }
.island:focus-within { opacity: 1; filter: none; box-shadow: var(--shadow-popover); }
```

mosac 区域(主区三岛)只升 shadow,不降 opacity — 避免影响 PixiJS 合成。

## 9. Flow / CodeMirror 专用

`--flow-edge / --flow-edge-dashed / --flow-minimap-bg / --flow-bg-dot` 走 light/dark 双档,
CodeMirror 主题通过 `var(--cm-*)` 在 EditorView.theme 内引用,保证 dark mode 下编辑器不白纸化。

## 10. 共享件(治本)

| 件 | 路径 | 用途 |
|---|---|---|
| `<PanelHeader>` | `components/ui/panel-header.tsx` | panel 头,3 档高度,自带 icon / subtitle / actions |
| `<EmptyState>` | `components/ui/empty-state.tsx` | 空态,统一图标 + 标题 + 副标题 + action |
| `<Button>` | `components/ui/button.tsx` | 5 个 variant × 4 个 size |
| `<TooltipProvider>` | `components/ui/tooltip.tsx` | hover 提示,300ms delay |
| `<Sheet>` / `<Dialog>` / `<Popover>` | `components/ui/*` | 浮层 3 件,统一 z-depth |

新增 panel 必须用 `<PanelHeader>`;新增空态必须用 `<EmptyState>`。
**禁止再写 `border-b border-border + text-xs uppercase tracking-wider` 这种内联 header 模板**。

## 11. 高对比度 / 强制色

- `prefers-contrast: more` → 禁用 opacity/filter 退让,改用 `border-border-strong` 实线
- `forced-colors: active` → 遵循系统调色板,只保留 `border CanvasText`

这些已经在 `global.css` 媒体查询里统一实现,组件无需重复写。
