# OhMyOpenCode (omo) 插件指令大全

> 来源核实:`~/.config/opencode/node_modules/oh-my-opencode/` 插件源码
> 整理日期:2026-07-18

omo 插件的指令体系分为三层:**9 个内置斜杠命令**、**20 个 Skills**(可通过 `/` 或自然语言触发)、以及背后的 **Agent 体系**(Sisyphus / explore / librarian / oracle / metis / momus / Sisyphus-Junior 等,非指令但支撑指令执行)。

---

## 一、内置斜杠命令(9 个)

### 1. 循环执行类

#### `/ralph-loop "任务描述" [--completion-promise=TEXT] [--max-iterations=N] [--strategy=reset|continue]`

启动 **Ralph Loop** —— 自引用开发循环,持续运行直到任务完成。

工作原理:
1. AI 持续工作处理任务
2. 认为任务**完全完成**时,输出 `<promise>DONE</promise>`(完成承诺标签)
3. 若未输出承诺,循环自动注入新提示继续工作
4. 默认最大迭代 100 次(可配置)

退出条件:
- **完成**:输出完成承诺标签
- **达到上限**:自动停止
- **取消**:用户执行 `/cancel-ralph`

规则:
- 专注完整完成任务,而非部分完成
- 任务未真正完成前不要输出完成承诺
- 每次迭代应有实质进展;卡住时尝试不同方法
- 用 todos 跟踪进度

适用:需要长时间无人值守推进的任务。

---

#### `/ulw-loop "任务描述" [--completion-promise=TEXT] [--strategy=reset|continue]`

**Ultrawork 循环** —— ralph-loop 的加强版,带验证机制。

与 ralph-loop 的关键区别:
- 输出完成承诺后**不算结束**,系统会要求 **Oracle 验证**
- 只有 Oracle 验证通过、系统确认后循环才结束
- 迭代上限:ultrawork 模式 500 次,普通模式 100 次

退出条件:
- **验证完成**:Oracle 验证结果且系统确认
- **取消**:用户执行 `/cancel-ralph`

适用:对完成质量要求高、需要防止 AI"假装完成"的任务。

---

#### `/cancel-ralph`

取消当前活跃的 Ralph/ULW 循环。

执行效果:
1. 停止循环继续
2. 清除循环状态文件
3. 允许会话正常结束

---

#### `/stop-continuation`

停止当前会话的**所有**自动续跑机制:

1. 停止 todo-continuation-enforcer(不再自动继续未完成任务)
2. 取消任何活跃的 Ralph Loop
3. 清除当前项目的 boulder 状态

执行后:
- 会话空闲时不再自动续跑
- 可手动继续工作
- 停止状态按会话生效,会话结束即清除

适用:需要暂停自动化、收回手动控制权时。

---

### 2. 计划与执行类

#### `/ulw-plan`(Skill,规划顾问 Prometheus)

写代码前的**探索式规划**顾问。

工作方式:
1. 先摸底代码库(ground in codebase)
2. 只对探索无法解决的**分歧点**提问;意图模糊时先研究到最佳实践
3. 等待用户**明确批准**
4. 产出一份**决策完备**(decision-complete)的工作计划,写入 `.omo/plans/*.md`

特点:执行者拿到计划后**零追问**即可开工。计划可通过 Momus 评审。

触发场景:5+ 步骤、范围模糊、多模块、架构决策、"做得好一点/看着办"式简报,或任何"做个计划/拆解工作"的请求。

---

#### `/start-work [plan-name] [--worktree <path>]`

启动 **Atlas 工作会话**,执行 `.omo/plans/` 中由 Prometheus 生成的计划。

工作流程:
1. **查找计划**:搜索 `.omo/plans/` 目录
2. **检查 boulder 状态**:读取 `.omo/boulder.json`
   - 多个活跃工作 → 询问用户恢复哪个
   - 恰好一个活跃工作 → 自动恢复
   - 无活跃工作 → 列出计划供选择(单计划自动选中)
3. **Worktree 设置**(仅显式指定 `--worktree` 时):创建/验证 git worktree,所有工作在 worktree 内进行
4. **创建/更新 boulder.json**:记录 active_plan、started_at、session_ids、plan_name、worktree_path
5. **读取完整计划**,按 Atlas 委派协议执行

强制任务分解:
- 每个计划复选项必须拆成具体的实现级子任务(涉及哪个文件、改什么、预期行为、如何验证)
- 全部注册为 todos 后才开工

Worktree 完成流程:
1. 提交 worktree 内所有变更
2. **同步 .omo 状态回主仓库**(`cp -r <worktree>/.omo/* <main>/.omo/`)
3. 切回主目录,合并 worktree 分支
4. 清理:`git worktree remove` + 删除 boulder.json

---

#### `/hyperplan <需求>`

**对抗性多智能体规划**(Team Mode)。

- 通过 `team_create` 组建包含 `unspecified-low`、`unspecified-high`、`ultrabrain`、`artistry` 类别成员的团队(若 `deep` 可用则包含)
- 5 个不同立场的成员**交叉批评**(hostile cross-critique),lead 综合出最终方案
- 遵循 7 阶段工作流

前置条件:`~/.config/opencode/oh-my-opencode.jsonc` 中设置 `team_mode.enabled: true` 并重启 opencode。

---

### 3. 质量与交付类

#### `/review-work`(Skill)

**实施后审查编排器**。并行启动 5 个后台子代理:

| 子代理 | 职责 |
|---|---|
| Oracle | 目标/约束验证 |
| Oracle | 代码质量 |
| Oracle | 安全 |
| unspecified-high | 实操 QA 执行 |
| unspecified-high | 上下文挖掘(GitHub/git/Slack/Notion) |

**全部通过才算审查通过**。任何重要实现完成后都应使用。

---

#### `/remove-ai-slops`

清除分支变更中的 **AI 代码异味(AI slop)**。

流程:
1. **识别变更文件**:动态检测 base 分支,`git diff merge-base..HEAD --name-only`
2. **并行清除**:对每个变更文件并行派发加载 `remove-ai-slops` skill 的 agent;派发前保存**仅含本次改动 delta 的回滚工件**(禁止 `git checkout --` 以免丢弃分支已有变更)
3. **批判性审查**,检查清单:
   - 安全性:功能逻辑未误删、错误处理保留、类型标注正确、import 有效、公共 API 无破坏
   - 行为保持:返回值/副作用/异常行为/边界情况不变
   - 代码质量:删除的确实是 AI slop、剩余代码符合项目规范、无孤儿代码
4. **修复问题**:仅回滚 slop-removal 的 delta,剩余问题手动逐文件清除

覆盖 **10 大 slop 类别**,包括性能等价物、过度复杂(对象注解、if/elif 变体链)、超长模块(250+ 纯 LOC 强制模块化拆分)等。

Team Mode 变体(`slop-squad` 团队):
- 3 个 quick worker 逐文件清除 + 1 个 unspecified-low fix worker 处理返工
- 评审**在团队外**以 `deep` 任务运行(团队成员会被降级为 sisyphus-junior,推理能力不足)
- 每个文件必须拿到评审 PASS 且无未决团队任务才结束
- 结束后必须清理团队(shutdown → delete),否则下次会话的前置检查会发现孤儿团队

---

#### `/refactor`

智能重构命令。触发词:refactor、cleanup、restructure、extract、simplify、modernize。

---

#### `/visual-qa`(Skill)

UI 改动后的**严谨视觉 QA**:

- 优先使用 `browser:control-in-app-browser`(Codex 内免认证),其次 Playwright/agent-browser/dev-browser
- 截图/TUI 证据采集 + 内置 diff 脚本做像素对比
- 设计系统/功能性 + 视觉保真度/CJK 文字裁切 双重评审
- 输出好/坏判决

触发:构建了任何 UI、或问"这个页面/组件/TUI 看起来对吗"。

---

### 4. 会话管理类

#### `/handoff`

上下文窗口将满、会话质量下降时,生成**结构化交接摘要**用于新会话无缝续作。

执行流程:
- **Phase 0.5(强制第一步)**:`session_read` 读取会话历史,**逐字**提取用户原始请求(禁止凭记忆复述)
- **Phase 1**:收集程序化上下文(session_read、todoread、`git diff --stat HEAD~10..HEAD`、`git status --porcelain`)
- **Phase 2**:以第一人称提取上下文(能力/行为层面,而非逐文件实现细节)
- **Phase 3**:按固定格式输出 `HANDOFF CONTEXT`:
  - USER REQUESTS (AS-IS) —— 逐字引用
  - GOAL —— 一句话
  - WORK COMPLETED / CURRENT STATE / PENDING TASKS(含 todo 状态)
  - KEY FILES(最多 10 个,按重要性排序)
  - IMPORTANT DECISIONS / EXPLICIT CONSTRAINTS(逐字)/ CONTEXT FOR CONTINUATION
- **Phase 4**:指导用户在新会话粘贴摘要续作

约束:不创建新会话(无 API)、不含敏感信息、KEY FILES 不超过 10 个。

---

## 二、Skills 指令(自然语言或 `/` 触发)

| 指令 | 用途 |
|---|---|
| `/ulw-research`(别名 `/ultraresearch`) | **最大饱和度研究编排**:并行 explore+librarian 集群扫荡代码库/网页/官方文档/OSS 仓库;由 worker 返回线索驱动递归 EXPAND 循环;运行代码实证验证;产出带引用的综合报告(可选 MD/HTML/PDF/PPTX)。仅显式要求研究时激活 |
| `/security-research`(别名 `/security-review`) | **Team Mode 安全审计**:3 个漏洞猎手 + 2 个 PoC 工程师并行审计,实证可利用性,按根因分类、按实际可利用性定级 |
| `/debugging` | **假设驱动的运行时调试**(任何语言/二进制):≥3 个假设 → 并行排查 → 2 轮失败后从正交角度派 Oracle → 确认根因 → 失败测试锁定 → 最小修复 → 实际使用做 QA |
| `/frontend` | 前端/UI/UX 工作路由:设计品味路由与品牌参考、Lighthouse/Core Web Vitals、调色板/字体/规范、人设/无障碍/评审/交接 |
| `/programming` | Python/Rust/TS/Go 编码规范路由:严格类型、现代技术栈(Pydantic v2 / serde+thiserror / Zod / gin+sqlc+pgx+slog)、现代工具链(uv+basedpyright+ruff / cargo+clippy+miri / Bun+Biome+tsc / gofumpt+golangci-lint v2)、parse-don't-validate、穷尽匹配、类型化错误、无 any/unwrap/panic、250 LOC 上限、TDD |
| `/git-master` | 原子提交、暂存、提交信息风格、rebase、squash、fixup/autosquash、blame、bisect、reflog、`git log -S/-G` |
| `/ast-grep` | AST 感知的结构化代码搜索与重写(25 种语言):找所有形如 X 的函数/调用/类/import、console.log→logger.info、剥离 `as any`、require→import 迁移、扫描/应用 YAML 规则 |
| `/lsp-setup` | 按语言配置 LSP(诊断/跳转定义/查找引用/重命名):按文件扩展名路由到对应 reference,含各 OS 安装命令与排错 |
| `/init-deep` | 初始化分层 AGENTS.md 知识库 |
| `/ultimate-browsing` | 被 WAF/Cloudflare/403/JS 渲染/登录墙拦截时的**升级网页访问**:curl_cffi TLS 指纹伪装、yt-dlp、Jina Reader、公共 API、CloakBrowser stealth Chromium;中文/社交平台原生读取(小红书/抖音/微博/B站/V2EX/微信) |
| `/coding-agent-sessions` | 跨 Codex/Claude Code/OpenCode/Cursor/Aider 等查找、读取、搜索、重建编码代理历史会话(transcript、session ID、token 用量、子代理链接) |
| `/playwright` | 浏览器自动化:验证、浏览、信息收集、抓取、测试、截图及一切浏览器交互 |
| `/lcx-doctor` | 诊断 LazyCodex/Codex CLI 安装健康度,对比最新源码审计本地安装 |
| `/lcx-report-bug` | 在归属仓库创建高信号 bug issue/PR(含源码级根因、复现步骤、修复指引) |
| `/lcx-contribute-bug-fix` | 贡献已验证的 bug 修复:上游 openai/codex 开 fork PR;LazyCodex 自有缺陷在 code-yeongyu/lazycodex 开 issue |

---

## 三、典型组合工作流

```
# 标准开发流
/ulw-plan → (Momus 评审计划) → /start-work → /review-work → /visual-qa → /git-master 提交

# 无人值守
/ulw-loop "任务"        # 带 Oracle 验证
/ralph-loop "任务"      # 普通循环

# 会话维护
/handoff                # 上下文将满时交接
/stop-continuation      # 停止所有自动续跑
/cancel-ralph           # 仅取消循环

# 质量专项
/remove-ai-slops        # 清除分支中的 AI 代码异味
/security-research      # 安全审计
```

---

## 四、配置参考

- 插件配置文件:`~/.config/opencode/oh-my-opencode.jsonc`
- 禁用命令:配置 `disabled_commands`(可选值:`ralph-loop`、`cancel-ralph`、`ulw-loop`、`refactor`、`start-work`、`stop-continuation`、`handoff`、`remove-ai-slops`、`hyperplan`)
- Team Mode 开关:`team_mode.enabled: true`(`/hyperplan`、team 版 `/remove-ai-slops` 需要)
- 计划目录:`.omo/plans/*.md`
- 工作状态:`.omo/boulder.json`
