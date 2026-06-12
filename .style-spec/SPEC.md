# .style-spec/SPEC.md
# 完整规约索引

## 目录结构

```
.style-spec/
├── README.md                    # AI Agent 入口说明
├── SPEC.md                      # 本文件：完整规约索引
│
├── core/                        # 核心规则（所有任务前必读）
│   ├── naming.yaml              # 业务实体 → 代码类型命名映射
│   ├── patterns.yaml            # 通用代码模式（Parser-Composer Pipeline、AST Visitor）
│   └── conventions.yaml         # 项目级技术约定
│
├── domain/                      # 领域规则（按需读取）
│   ├── script-editor/           # 剧本编辑器（ScriptEditor、FlowView、DialogueBlock）
│   ├── character/               # 角色系统（CharacterCard、SpriteSet、RelationGraph）
│   ├── scene/                   # 场景系统（Scene、SceneBackground、BGM）
│   ├── voice/                   # 语音系统（VoiceLine、TTS）
│   └── export/                  # 导出系统（Exporter、ExportTarget）
│
├── layers/                      # 技术分层规则（按需读取）
│   ├── renderer/                # React 前端约定
│   ├── main-process/            # Electron 主进程约定
│   └── dsl/                    # gal DSL 语言规范
│
├── languages/                   # 语言特定规则
│   ├── typescript/              # TypeScript 严格约定
│   └── javascript/              # JavaScript 约定（仅限 Lezer 等必需场景）
│
└── legacy/                      # 历史规则（已废弃但保留参考）
```

## 快速查表

### 命名规则速查

| 业务概念 | 代码类型 | 所在文件 |
|---------|---------|---------|
| 剧本 | Script, ScriptFile, ScriptNode | core/naming.yaml |
| 角色 | Character, CharacterCard, CharacterSprite | core/naming.yaml |
| 场景 | Scene, SceneBackground | core/naming.yaml |
| 对白 | Dialogue, DialogueNode | core/naming.yaml |
| 选项 | Choice, PlayerChoice, ChoiceNode | core/naming.yaml |
| 剧本编辑器 | ScriptEditor, FlowView | domain/script-editor/naming.yaml |
| 角色卡 | CharacterCardEditor, SpriteSetGrid | domain/character/naming.yaml |
| 导出器 | RenPyExporter, WebExporter, InkExporter | domain/export/naming.yaml |

### 关键架构模式

| 模式 | 描述 | 所在文件 |
|------|------|---------|
| Parser-Composer Pipeline | 解析器转 AST，Composer 把 AST 渲染为目标格式 | core/patterns.yaml |
| AST Nodevisitor | 遍历决策树 AST 的标准模式 | core/patterns.yaml |
| Asset Reference by Relative Path | 资产引用必须用相对路径 | core/patterns.yaml |
| Result Type | 业务错误用 Result<T, E> 而非抛异常 | layers/main-process/conventions.yaml |
| IPC Channel Naming | 命名空间:module:action | layers/main-process/conventions.yaml |

### 技术约束

| 约束 | 说明 | 所在文件 |
|------|------|---------|
| TypeScript strict mode | 必须开启所有 strict 选项 | languages/typescript/conventions.yaml |
| 无 barrel re-export | 禁止 index.ts 聚合导出 | languages/typescript/conventions.yaml |
| IPC 封装 | 所有 IPC 调用在 lib/ipc/ 下封装为 hooks | layers/renderer/conventions.yaml |
| DSL 行级语义 | .gal 文件每行一个语义，无多行块 | layers/dsl/conventions.yaml |
| Git 即版本控制 | 项目根目录即 Git 仓库根 | core/conventions.yaml |
| 仓库认证元信息 | remote URL、SSH 公钥指纹、git user,不存私钥 | core/conventions.yaml → repository_credentials |

---

*最后更新：June 2026*
