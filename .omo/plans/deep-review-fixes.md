# deep-review-fixes — Work Plan

## TL;DR (For humans)

**What you'll get:** 14 项修复覆盖安全漏洞、架构风险、性能瓶颈和 UX 缺口，按 P0→P2 优先级分 3 波执行。

**Why this approach:** 以之前 2 轮共 14+ agent 的深度审查发现为依据,优先修复安全漏洞和架构定时炸弹,再优化性能和用户体验。

**What it will NOT do:** 不新增功能,不改数据库,不改 electron-builder 签名配置,不升级任何依赖(已在第一轮完成)。

**Effort:** Large (3-5 days)
**Risk:** Medium — VM 序列化替换和 Zustand store 拆分有回归风险
**Decisions to sanity-check:** VM 序列化用 esbuild 还是手写代码生成器; Zustand 拆分粒度; CSP 策略宽松度

---

> TL;DR (machine): Large, Medium risk, 14 todos across 3 waves: P0 security+architecture → P1 performance+visual → P2 UX+cleanup

## Scope
### Must have
- Agent export_project/create_project 路径包含检查
- Store handlers + Character handlers Zod 校验
- CSP header
- `.toString()` VM 序列化替换为 esbuild bundle
- `manualChunks` + `React.lazy()` 代码分割
- `React.memo` FlowView/BeatList/PanelHeader + `useShallow`
- 打字机 MarkdownBody debounce (100ms)
- borderRadius naming 修复 + Framer Motion reduced-motion
- `parseProject` 文件级增量缓存

### Must NOT have
- 产品功能变更
- 依赖升级（已完成）
- electron-builder 签名配置
- 数据库变更
- 新 UI 组件（仅重构现有）

## Verification strategy
- Test decision: tests-after
- Evidence: .omo/evidence/task-<N>-deep-review-fixes.log
- Regression gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`

## Execution strategy
### Parallel execution waves

Wave 1 (P0, 4 todos): 全部独立,可并行
Wave 2 (P1, 5 todos): T5→T7 可并行, T6 独立, T8 独立, T9 独立
Wave 3 (P2, 5 todos): T11→T13→T14 有依赖, T10/T12 独立

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
|------|-----------|--------|---------------------|
| T1 (agent path containment) | — | — | T2, T3, T4 |
| T2 (store+char Zod) | — | — | T1, T3 |
| T3 (CSP header) | — | — | T1, T2 |
| T4 (VM serialization) | — | T11 (preview parity) | T1-T3 |
| T5 (code splitting) | — | — | T6, T7 |
| T6 (React.memo + useShallow) | — | — | T5 |
| T7 (typewriter debounce) | — | — | T5 |
| T8 (borderRadius + motion) | — | — | Any |
| T9 (parseProject cache) | — | — | Any |
| T10 (onboarding) | — | — | Any |
| T11 (preview rewind/auto) | T4 (VM stable) | — | T12 |
| T12 (editor autocomplete) | — | — | T11 |
| T13 (split Zustand + kill DAG) | — | T14 | — |
| T14 (simplify layout) | T13 | — | — |

## Todos

### Wave 1: P0 — Security + Architecture Risk

- [ ] 1. Agent `export_project` / `create_project` 路径包含检查
  What to do: In `src/main/ai/agent/tools/platform-tools.ts`, add path containment check to `exportProject` and `createProject` handlers. After determining `outputPath`/`directory`, call `path.resolve()` and verify the result starts with `path.resolve(ctx.projectPath) + path.sep`. Return structured error with code `OUTSIDE_PROJECT` if outside. Also add `refine` to `ExportRequestSchema` in `src/main/ipc/schemas/index.ts` rejecting `..` segments.
  Must NOT do: Do NOT change the default output path logic. Do NOT break existing export tests.
  References: `src/main/ai/agent/tools/platform-tools.ts:44-47`, `src/main/ipc/schemas/index.ts:372-376`
  Acceptance: Malicious `outputPath` returns `{ ok: false, error: { code: 'OUTSIDE_PROJECT' } }`. Existing export tests pass.
  QA: Happy — export to project subdirectory works. Failure — export to `/etc` returns error.
  Commit: Y | security(agent): add path containment to export_project and create_project

- [ ] 2. Store handlers + Character handlers Zod 校验
  What to do: In `src/main/ipc/store-handlers.ts`, add Zod schema for store keys (`z.enum(['aiConfig', 'recentProjects', 'shortcuts'])`) and validate with `parseIpcArgs()`. In `src/main/ipc/character-handlers.ts`, import existing `CharacterCreateSchema`/`CharacterUpdateSchema`/etc from `schemas/index.ts` and apply `parseIpcArgs()` in each handler.
  Must NOT do: Do NOT remove existing try/catch. Do NOT change handler return types.
  References: `src/main/ipc/store-handlers.ts:6-16`, `src/main/ipc/character-handlers.ts:29-67`, `src/main/ipc/schemas/index.ts:230-249`
  Acceptance: Invalid store key → `SCHEMA_FAILED`. Invalid character data → `SCHEMA_FAILED`.
  QA: Happy — valid inputs work. Failure — `store.set('maliciousKey', 'x')` returns error.
  Commit: Y | security(ipc): add Zod validation to store and character handlers

- [ ] 3. CSP header for renderer
  What to do: In `src/main/index.ts`, after `createWindow()`, add `session.defaultSession.webRequest.onHeadersReceived` handler setting CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws:; font-src 'self'`. In dev mode, add `ws://` for HMR. Adjust if Vite dev server needs additional directives.
  Must NOT do: Do NOT set CSP so restrictive it breaks the app. Test dev and production modes.
  References: `src/main/index.ts:22-37`, `electron.vite.config.ts`
  Acceptance: App launches without CSP violation errors in devtools console in both dev and production modes.
  QA: Happy — no CSP violations. Failure — blocked resource → adjust directive.
  Commit: Y | security(electron): add Content-Security-Policy header

- [ ] 4. Replace `.toString()` VM 序列化为 esbuild bundle
  What to do: In `src/main/export/web-composer.ts`, replace `buildPlayerRuntimeFunctions()` (which calls `.toString()` on untyped `*Impl` functions) with an esbuild-inlined bundle of `src/shared/preview/runtime-vm.ts`. Use esbuild's `buildSync` with `format: 'iife'` to produce a self-contained JS string embedded in the HTML export. Remove `// eslint-disable-next-line` directives from the `*Impl` functions and restore proper types. Update `runtime-vm.ts` test to use the typed exports directly (not `.toString()`).
  Must NOT do: Do NOT change the runtime VM behavior. Do NOT break Web export html output format. Do NOT remove the `*Impl` function pattern — keep them for TypeScript consumption.
  References: `src/main/export/web-composer.ts`, `src/shared/preview/runtime-vm.ts:46-130`, `src/shared/preview/vm-save.ts:53-80`
  Acceptance: Web export produces identical HTML output. All preview + Web export tests pass. `*Impl` functions have proper types restored.
  QA: Happy — exported HTML runs correctly. Failure — serialized VM produces different behavior → compare outputs.
  Commit: Y | refactor(export): replace toString() VM serialization with esbuild bundle

### Wave 2: P1 — Performance + Visual

- [ ] 5. `manualChunks` + `React.lazy()` 代码分割
  What to do: In `electron.vite.config.ts`, add `output.manualChunks` splitting PixiJS, CodeMirror, ReactFlow, framer-motion, Radix UI into separate chunks. In `src/renderer/src/app/App.tsx`, wrap PreviewCanvas, FlowView, AgentModePanel with `React.lazy()` + `<Suspense>`. Add a simple spinner as fallback. Keep core editor (ScriptEditor, BeatCardEditor) in main bundle.
  Must NOT do: Do NOT lazy-load the core editor or toolbar — only secondary panels. Do NOT change any component props.
  References: `electron.vite.config.ts:37-41`, `src/renderer/src/app/App.tsx`
  Acceptance: `pnpm build` produces 4+ chunks (not single `index-*.js`). Main chunk < 2MB. `pnpm dev` still works.
  QA: Happy — build has multiple chunks, app loads with lazy panels rendering on demand. Failure — lazy panel fails to load → check Suspense boundary.
  Commit: Y | perf(bundle): add manualChunks code splitting + React.lazy secondary panels

- [ ] 6. `React.memo` FlowView/BeatList/PanelHeader + `useShallow`
  What to do: Add `React.memo()` to: `FlowView` (FlowView.tsx), `FlowNode` + `FlowMarkerNode` (FlowNode.tsx), `BeatList` (BeatList.tsx), `PanelHeader` (panel-header.tsx). Replace multiple `useUiStore(selector)` calls with single `useUiStore(useShallow(...))` in PreviewCanvas (8 selectors → 1) and FlowView (5 → 1). Import `useShallow` from 'zustand/react/shallow'.
  Must NOT do: Do NOT change component behavior. Do NOT change store selectors — only batch them.
  References: `src/renderer/src/features/flow-view/FlowView.tsx`, `src/renderer/src/features/beat-editor/BeatList.tsx`, `src/renderer/src/features/preview/PreviewCanvas.tsx:43-50`, `src/renderer/src/components/workspace/panel-header.tsx`
  Acceptance: Components wrapped in `React.memo`. PreviewCanvas has single `useShallow` selector. All tests pass.
  QA: Happy — app renders identically, fewer React DevTools re-render highlights. Failure — memo comparison breaks a component → check areEqual.
  Commit: Y | perf(render): add React.memo + useShallow to heavy components

- [ ] 7. 打字机 MarkdownBody debounce (100ms)
  What to do: In `src/renderer/src/features/ai-panel/AiMessageBubble.tsx`, modify `StreamingTypewriter` to debounce the `MarkdownBody` render. Keep character-by-character animation for cursor/raw text, but only pass updated text to `MarkdownBody` every 100ms (or when streaming completes). Use `useEffect` with `setTimeout` to accumulate text and trigger markdown re-render on a separate state variable `markdownText`. Keep cursor blink as lightweight `<span>` animation.
  Must NOT do: Do NOT remove the typewriter visual effect — characters still appear one-at-a-time. Only the markdown PARSE is debounced.
  References: `src/renderer/src/features/ai-panel/AiMessageBubble.tsx:71-119`
  Acceptance: Streaming AI response still appears character-by-character. MarkdownBody only re-renders ~10 times (not 2000) for a 2000-char response. Visual output identical.
  QA: Happy — streaming looks identical, Profiler shows fewer MarkdownBody renders. Failure — markdown not updating → check timer cleanup.
  Commit: Y | perf(ai): debounce markdown parse in typewriter to 100ms

- [ ] 8. borderRadius naming 修复 + Framer Motion reduced-motion
  What to do: In `tailwind.config.js`, fix the borderRadius scale so `rounded-sm < rounded-md < rounded-lg < rounded-xl < rounded-2xl` forms a monotonic scale (suggest: sm=4px, md=6px, lg=8px, xl=12px, 2xl=16px). Audit all component className usages and update to use correct semantic token. In `src/renderer/src/main.tsx`, wrap `<App />` with `<MotionConfig reducedMotion={useReducedMotion() ? 'always' : 'never'}>`. In `global.css`, add `@media (prefers-reduced-motion: reduce)` kill switch for tailwindcss-animate classes.
  Must NOT do: Do NOT change visual appearance — corner radii should look the same, just use correct names. Do NOT remove animations — only add reduced-motion support.
  References: `tailwind.config.js:36-41`, `src/renderer/src/main.tsx:49`, `src/renderer/src/styles/global.css`
  Acceptance: borderRadius scale is monotonic. Components use correct semantic names. Framer Motion respects OS reduced-motion setting.
  QA: Happy — visual unchanged, reduced-motion user sees no animations. Failure — visual regression → compare screenshots.
  Commit: Y | fix(design): correct borderRadius naming scale + add reduced-motion support

- [ ] 9. `parseProject` 文件级增量缓存
  What to do: In `src/main/ipc/script-service.ts`, add a `Map<string, { mtime: number, ast: ScriptNode }>` cache. Before parsing a file, check if `mtime` matches the cached entry. Invalidate cache entry on `writeScript()`. The `mergeScriptAsts` call still runs fresh each time, but individual file parsing is skipped for unchanged files.
  Must NOT do: Do NOT cache across different projects. Do NOT cache parse errors — always re-parse failed files. Do NOT change the merge pipeline.
  References: `src/main/ipc/script-service.ts`, `src/main/export/parse-project-scripts.ts`
  Acceptance: Editing one file in a 10-file project → parseProject only re-parses that one file. Existing tests pass unchanged.
  QA: Happy — parseProject time reduced for multi-file projects. Failure — stale cache after external file change → check mtime comparison.
  Commit: Y | perf(parse): add file-level mtime-based parse cache

### Wave 3: P2 — UX + Architecture Cleanup

- [ ] 10. 新手引导 + 示例项目
  What to do: In `src/renderer/src/app/WelcomeScreen.tsx`, add an "打开示例项目" button that creates/copies a minimal `.gal` project with a few scenes showing basic DSL syntax (scene, dialogue, choice, goto). Add a 3-step tutorial overlay (↔1: "创建项目" → 2: "编写剧本" → 3: "预览导出") with skip button. Persist "tutorial seen" flag in localStorage.
  Must NOT do: Do NOT block the main UI with a forced tutorial. Allow skip. Do NOT add external documentation links without user opt-in.
  References: `src/renderer/src/app/WelcomeScreen.tsx`
  Acceptance: First launch shows tutorial overlay. "打开示例" creates a working sample project. Tutorial can be skipped. Second launch doesn't show tutorial.
  QA: Happy — new user sees guidance, can open sample. Failure — tutorial blocks UI → ensure skip works.
  Commit: Y | feat(ux): add onboarding tutorial overlay + sample project template

- [ ] 11. 预览步退 + 自动播放 + 存档标签
  What to do: In `src/shared/preview/runtime-vm.ts`, add `stepBack(state: VmState): VmState` function (maintain a history stack, max 100 entries). In `PreviewCanvas.tsx`, add a "步退" button, an "自动播放" toggle (auto-advance every 2s), and show scene name + timestamp as save slot labels. Store history in VmState alongside current position.
  Must NOT do: Do NOT change the advance/jump logic. Do NOT remove existing save/load behavior. Do NOT persist history across sessions.
  References: `src/shared/preview/runtime-vm.ts`, `src/renderer/src/features/preview/PreviewCanvas.tsx`
  Acceptance: Click "步退" → returns to previous step. Toggle "自动播放" → auto-advances every 2s. Save slots show "Scene:开场" + timestamp.
  QA: Happy — rewind works for all step types. Failure — history overflow → cap at 100, warn.
  Commit: Y | feat(preview): add step-back, auto-play toggle, and labeled save slots

- [ ] 12. 编辑器自动补全 + 行内错误标记
  What to do: In CodeMirror 6 gal language extension, add autocompletion source providing: scene IDs (from projectMergedAst), character names (from manifest), DSL keywords (scene/dialogue/choice/goto/set/if/marker/chapter). Use `@codemirror/autocomplete`. Add a `lintSource` extension that reads `diagnostics` from script-store and shows gutter marks + squiggly underlines. Remove or keep the right-side DiagnosticsPanel as secondary view.
  Must NOT do: Do NOT change the DSL parser. Do NOT change the diagnostics data structure. Do NOT remove DiagnosticsPanel if still useful.
  References: `src/renderer/src/lib/codemirror/gal-language.ts`, `src/renderer/src/features/script-editor/DiagnosticsPanel.tsx`
  Acceptance: Typing `## ` triggers scene ID completion. Errors appear as red squiggly underlines + gutter marks. Clicking gutter mark jumps to error.
  QA: Happy — autocomplete works for scene IDs and keywords. Failure — completion blocks typing → check `activateOnTyping` config.
  Commit: Y | feat(editor): add DSL autocomplete + inline error markers

- [x] 13. 拆分 Zustand store + 删除 topology-dag.ts
  What to do: Split `useUiStore` into 4 independent stores: `useScriptStore` (script content + AST + fileCache), `useProjectStore` (projectPath + manifest + parseError), `useWorkspaceStore` (dock + presets + floating), `useUiStore` (theme + recentProjects + remaining UI state). Replace `setProject`/`closeProject` cross-slice logic with a `useOpenProject`/`useCloseProject` coordinator hook. Delete `src/main/ai/agent/topology-dag.ts` — the DAG is documentation, not runtime. Move the Mermaid diagram to `docs/agent-architecture.md` (standalone doc, not a code comment). Remove all `as never` casts.
  Must NOT do: Do NOT change store state shape. Do NOT change component hook usage — `useUiStore(s => s.theme)` should still work. Do NOT change agent-loop behavior.
  References: `src/renderer/src/lib/store.ts`, `src/renderer/src/lib/script-store.ts`, `src/renderer/src/lib/workspace-store.ts`, `src/renderer/src/lib/project-store.ts`, `src/main/ai/agent/topology-dag.ts`
  Acceptance: 4 independent stores. Zero `as never` casts. `setProject`/`closeProject` logic in coordinator hook. topology-dag.ts deleted. All store tests pass.
  QA: Happy — `pnpm test` passes with all store tests. Failure — cross-store state inconsistency → check coordinator hook.
  Commit: Y (2 commits) | refactor(store): split into independent Zustand stores | chore(agent): remove dead topology-dag.ts

- [x] 14. 简化布局状态模型
  What to do: Replace the 4-field layout model (`dockSide: Record<Id, DockSide>`, `visiblePerSide: VisiblePerSide`, `activeSubIsland: Record<Id, SubIslandId>`, `floatingPanels: string[]`) with a single `panelStates: Record<ToolWindowId, PanelState>` where `PanelState = { visible: boolean; dock: DockSide; activeSub: SubIslandId }`, plus `floatingPanels: readonly string[]`. The old `dockSide`/`visiblePerSide`/`activeSubIsland` become derived fields in the store. Remove `PlaceholderId` concept; `search` is upgraded to a real but default-hidden `ToolWindowId`. Keep `workspace-presets.ts` snapshot capture (`captureWorkspaceSnapshot` / `applyWorkspacePreset`) to declaratively apply per-preset layouts. Update `workspace-store.ts`, `store.ts`, `ActivityBar.tsx`, `CenterSplit.tsx`, `SideToolWindow.tsx`, `FloatingPanelHost.tsx`, and related tests to use the simplified model.
  Must NOT do: Do NOT change the visual layout. Do NOT change panel behavior. Do NOT remove any existing panel.
  References: `src/renderer/src/lib/workspace-store.ts`, `src/renderer/src/lib/workspace-store.types.ts`, `src/renderer/src/lib/store.ts`, `src/renderer/src/components/workspace/panels/panel-registry.ts`, `src/renderer/src/lib/workspace-presets.ts`, `src/renderer/src/lib/hooks/use-workspace-persistence.ts`
  Acceptance: `workspace-store.ts` < 100 LOC (was 207). Layout persistence still works. All panels function identically.
  QA: Happy — switch presets, float panels, close panels → all work as before. Failure — panel disappears → check state migration.
  Commit: Y | refactor(layout): simplify island state model to flat map

## Final verification wave
- [ ] F1: Plan compliance — every todo has refs + acceptance + QA + commit
- [ ] F2: Code quality — `pnpm typecheck && pnpm lint` both 0 errors
- [ ] F3: Regression — `pnpm test` passes (594+ tests)
- [ ] F4: Build — `pnpm build` succeeds
- [ ] F5: Security — agent path containment works, CSP header present, all Zod gaps closed

## Commit strategy
- One commit per todo, atomic and revertible
- T13 has 2 commits (store split + DAG deletion)
- Wave order: P0 → P1 → P2, but within each wave todos are parallelizable

## Success criteria
- 0 security vulnerabilities (agent path traversal fixed, CSP present, Zod coverage complete)
- `.toString()` VM serialization replaced with typed esbuild bundle
- Main bundle < 2MB (from 4.1MB)
- Preview has step-back + auto-play
- borderRadius scale is monotonic throughout codebase
- Zero `as never` casts in store code
- `topology-dag.ts` deleted
- Layout state model < 100 LOC
